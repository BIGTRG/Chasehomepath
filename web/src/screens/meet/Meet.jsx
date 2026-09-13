/* global EventSource, RTCPeerConnection */
import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { meet as meetApi } from '../../api/client.js';

/**
 * In-app video room. Browser-to-browser WebRTC (mesh), signaling over SSE + POST
 * through our API. Works for the first consultation, 1:1 sessions, and small groups.
 */
export default function Meet() {
  const { code } = useParams();
  const [room, setRoom] = useState(null);
  const [error, setError] = useState(null);
  const [peers, setPeers] = useState({}); // peerId -> { name, stream }
  const [joined, setJoined] = useState(false);
  const [muted, setMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);
  const localRef = useRef(null);
  const state = useRef({ me: null, local: null, pcs: new Map(), es: null, ice: [] });

  useEffect(() => {
    meetApi.info(code).then((d) => setRoom(d.room)).catch((e) => setError(e.message));
    return leave;
  }, [code]);

  async function join() {
    setError(null);
    try {
      const local = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: true });
      state.current.local = local;
      if (localRef.current) localRef.current.srcObject = local;
    } catch {
      setError('Camera or microphone was blocked. Allow access in your browser and try again.');
      return;
    }
    const es = new EventSource(meetApi.eventsUrl(code));
    state.current.es = es;
    es.addEventListener('welcome', (ev) => {
      const { peerId, peers: existing, iceServers } = JSON.parse(ev.data);
      state.current.me = peerId;
      state.current.ice = iceServers;
      setJoined(true);
      // New arrival offers to everyone already in the room.
      for (const p of existing) connectTo(p.peerId, p.name, true);
    });
    es.addEventListener('peer-joined', (ev) => {
      const { peerId, name } = JSON.parse(ev.data);
      connectTo(peerId, name, false);
    });
    es.addEventListener('peer-left', (ev) => {
      const { peerId } = JSON.parse(ev.data);
      state.current.pcs.get(peerId)?.close();
      state.current.pcs.delete(peerId);
      setPeers((p) => { const n = { ...p }; delete n[peerId]; return n; });
    });
    es.addEventListener('signal', async (ev) => {
      const { from, type, payload } = JSON.parse(ev.data);
      const pc = state.current.pcs.get(from) ?? connectTo(from, 'Guest', false);
      if (type === 'offer') {
        await pc.setRemoteDescription(payload);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        meetApi.signal(code, { from: state.current.me, to: from, type: 'answer', payload: pc.localDescription });
      } else if (type === 'answer') {
        await pc.setRemoteDescription(payload);
      } else if (type === 'ice' && payload) {
        try { await pc.addIceCandidate(payload); } catch { /* late candidate */ }
      }
    });
    es.onerror = () => setError('Connection to the room dropped. Rejoin to continue.');
  }

  function connectTo(peerId, name, initiator) {
    if (state.current.pcs.has(peerId)) return state.current.pcs.get(peerId);
    const pc = new RTCPeerConnection({ iceServers: state.current.ice });
    state.current.pcs.set(peerId, pc);
    for (const track of state.current.local.getTracks()) pc.addTrack(track, state.current.local);
    pc.onicecandidate = (e) => e.candidate && meetApi.signal(code, { from: state.current.me, to: peerId, type: 'ice', payload: e.candidate });
    pc.ontrack = (e) => setPeers((p) => ({ ...p, [peerId]: { name, stream: e.streams[0] } }));
    setPeers((p) => ({ ...p, [peerId]: { name, stream: p[peerId]?.stream ?? null } }));
    if (initiator) {
      pc.createOffer().then(async (offer) => {
        await pc.setLocalDescription(offer);
        meetApi.signal(code, { from: state.current.me, to: peerId, type: 'offer', payload: pc.localDescription });
      });
    }
    return pc;
  }

  function leave() {
    state.current.es?.close();
    for (const pc of state.current.pcs.values()) pc.close();
    state.current.pcs.clear();
    state.current.local?.getTracks().forEach((t) => t.stop());
    state.current.local = null;
    setJoined(false);
    setPeers({});
  }

  function toggleMute() {
    state.current.local?.getAudioTracks().forEach((t) => { t.enabled = muted; });
    setMuted(!muted);
  }
  function toggleCam() {
    state.current.local?.getVideoTracks().forEach((t) => { t.enabled = camOff; });
    setCamOff(!camOff);
  }

  if (error && !room) return <div className="content"><div className="error">{error}</div><Link to="/">Back</Link></div>;
  if (!room) return <div className="loading">Loading…</div>;
  const when = new Date(room.scheduledAt);
  const others = Object.entries(peers);

  return (
    <div className="meet">
      <header className="meet-top">
        <div>
          <div className="meet-title">{room.title}</div>
          <div className="meet-sub">{when.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}, {room.durationMin} min</div>
        </div>
        <Link className="link" to={room.role === 'host' ? '/' : '/billing'}>Exit</Link>
      </header>

      {error && <div className="error">{error}</div>}

      {!joined ? (
        <div className="meet-lobby">
          {room.open && <video ref={localRef} autoPlay muted playsInline className="meet-preview" />}
          {room.open ? (
            <>
              <p className="meet-note">You are about to join. Your camera and microphone turn on when you enter.</p>
              <button type="button" className="btn" onClick={join}>Join session</button>
            </>
          ) : Date.now() < new Date(room.opensAt) ? (
            <p className="meet-note">This room opens 10 minutes before the session, at {new Date(room.opensAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} on {when.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}.</p>
          ) : (
            <p className="meet-note">This session has ended.</p>
          )}
          <p className="meet-fine">Video runs directly between the people in the room over an encrypted connection. CHASE HomePath does not record sessions.</p>
        </div>
      ) : (
        <>
          <div className={`meet-grid n${Math.min(others.length + 1, 6)}`}>
            <div className="meet-tile me"><video ref={localRef} autoPlay muted playsInline /><span className="meet-name">You{muted ? ', muted' : ''}</span></div>
            {others.map(([id, p]) => <PeerTile key={id} name={p.name} stream={p.stream} />)}
          </div>
          {others.length === 0 && <div className="meet-waiting">Waiting for {room.role === 'host' ? 'the member' : 'your counselor'} to join…</div>}
          <div className="meet-bar">
            <button type="button" className={`meet-btn ${muted ? 'off' : ''}`} onClick={toggleMute}>{muted ? 'Unmute' : 'Mute'}</button>
            <button type="button" className={`meet-btn ${camOff ? 'off' : ''}`} onClick={toggleCam}>{camOff ? 'Camera on' : 'Camera off'}</button>
            <button type="button" className="meet-btn end" onClick={leave}>Leave</button>
          </div>
        </>
      )}
    </div>
  );
}

function PeerTile({ name, stream }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current && stream) ref.current.srcObject = stream; }, [stream]);
  return (
    <div className="meet-tile">
      {stream ? <video ref={ref} autoPlay playsInline /> : <div className="meet-connecting">Connecting…</div>}
      <span className="meet-name">{name}</span>
    </div>
  );
}
