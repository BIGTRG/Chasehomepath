import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { journey as journeyApi, agent as agentApi, billing as billingApi } from '../../api/client.js';
import { COUNSELOR } from '../../brand.js';
import { money } from '../billing/Plans.jsx';

// The meeting with Maren (onboarding v2, step 5). A video room: Maren speaks each agenda
// line aloud (device voice today; the studio voice and live face land with the avatar
// stack), captions show every word, the member's camera is optional. Ends in the plan
// choice, and payment happens without leaving the room.
export default function MarenRoom() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [m, setM] = useState(null);
  const [plans, setPlans] = useState(null);
  const [i, setI] = useState(0);
  const [speaking, setSpeaking] = useState(false);
  const [muted, setMuted] = useState(false);
  const [camOn, setCamOn] = useState(false);
  const [q, setQ] = useState('');
  const [answer, setAnswer] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  useEffect(() => {
    journeyApi.meeting(id).then((r) => setM(r.meeting)).catch((e) => setError(e.message));
    billingApi.plans().then(setPlans).catch(() => setPlans({ plans: [] }));
  }, [id]);

  const say = useCallback((text) => {
    if (muted || typeof window === 'undefined' || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const u = new window.SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices();
    u.voice = voices.find((v) => /en-US/i.test(v.lang) && /female|samantha|aria|jenny|zira|karen/i.test(v.name)) || voices.find((v) => /en-US/i.test(v.lang)) || null;
    u.rate = 0.98; u.pitch = 1.02;
    u.onstart = () => setSpeaking(true); u.onend = () => setSpeaking(false); u.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(u);
  }, [muted]);

  useEffect(() => { if (m) say(m.agenda[i].say); return () => window.speechSynthesis?.cancel(); }, [m, i, say]);

  async function toggleCam() {
    if (camOn) { streamRef.current?.getTracks().forEach((t) => t.stop()); streamRef.current = null; setCamOn(false); return; }
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240 }, audio: false });
      streamRef.current = s; if (videoRef.current) videoRef.current.srcObject = s; setCamOn(true);
    } catch { setError('Camera not available. You can continue without it.'); }
  }
  useEffect(() => () => streamRef.current?.getTracks().forEach((t) => t.stop()), []);

  async function ask() {
    if (!q.trim()) return;
    setBusy(true);
    try { const r = await agentApi.ask(`${q} (We are in your first meeting, on: ${m.agenda[i].title})`); setAnswer(r.answer); say(r.answer); } catch (e) { setAnswer(e.message); } finally { setBusy(false); setQ(''); }
  }
  async function leaveWithoutPlan() {
    setBusy(true);
    try { await journeyApi.completeMeeting(id, null); navigate('/start'); } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  if (error && !m) return <div className="content"><div className="error">{error}</div><Link to="/start">Back</Link></div>;
  if (!m) return <div className="loading">Opening your room…</div>;
  if (m.status === 'completed') return <div className="content"><div className="card gl"><div className="n">This meeting is finished.</div><p className="s">Your plan and schedule are waiting.</p><Link className="btn" to="/start">Continue</Link></div></div>;

  const step = m.agenda[i];
  const last = i === m.agenda.length - 1;
  const rec = (plans?.plans || []).filter((p) => m.recommended.includes(p.code)).sort((a, b) => m.recommended.indexOf(a.code) - m.recommended.indexOf(b.code));

  return (
    <div className="room">
      <div className="room-top">
        <div><div className="room-title">{COUNSELOR.name}</div><div className="room-sub">{COUNSELOR.title} · virtual counselor</div></div>
        <div className="room-step">{i + 1} / {m.agenda.length}</div>
      </div>

      <div className={`room-stage ${speaking ? 'speaking' : ''}`}>
        <div className="maren"><div className="maren-face"><span>M</span></div><div className="maren-wave"><i /><i /><i /><i /><i /></div><div className="maren-name">{COUNSELOR.name}</div></div>
        <div className={`self ${camOn ? 'on' : ''}`}>{camOn ? <video ref={videoRef} autoPlay playsInline muted /> : <span>You</span>}</div>
      </div>

      <div className="captions">
        <div className="cap-title">{step.title}</div>
        <p className="cap-text">{step.say}</p>
        {step.screen && step.screen !== '/' && step.kind !== 'plans' && <Link className="link" to={step.screen} target="_blank">Open this in the app</Link>}
      </div>

      {step.kind === 'plans' && (
        <div className="room-plans">
          {rec.map((p, k) => (
            <div key={p.code} className={`card plan-card ${k === 0 ? 'hl' : ''}`}>
              <div className="item-top"><div><div className="n">{p.name}{k === 0 && <span className="pill g" style={{ marginLeft: 8 }}>Best fit</span>}</div><div className="s">{p.tagline || `${p.targetMonths}-month target`}</div></div><div className="price">{money(p.priceCents)}<small>/mo</small></div></div>
              <button type="button" className="btn" onClick={() => navigate(`/checkout/${p.code}?meeting=${id}`)}>Start {p.name} and pay</button>
            </div>
          ))}
          <div className="s" style={{ textAlign: 'center' }}><Link to={`/plans?meeting=${id}`}>See all three plans</Link> · <button type="button" className="link" style={{ background: 'none', border: 0, font: 'inherit', padding: 0 }} disabled={busy} onClick={leaveWithoutPlan}>Not today</button></div>
        </div>
      )}

      <div className="room-ask">
        <input value={q} placeholder={`Ask ${COUNSELOR.name} about this…`} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && ask()} />
        <button type="button" className="btn small" disabled={busy || !q.trim()} onClick={ask}>{busy ? '…' : 'Ask'}</button>
      </div>
      {answer && <div className="captions answer"><p className="cap-text">{answer}</p></div>}

      <div className="room-bar">
        <button type="button" className="rb" onClick={() => setMuted((x) => { if (!x) window.speechSynthesis?.cancel(); return !x; })} aria-pressed={muted}>{muted ? 'Voice off' : 'Voice on'}</button>
        <button type="button" className="rb" onClick={toggleCam}>{camOn ? 'Camera off' : 'Camera on'}</button>
        <button type="button" className="rb" onClick={() => say(step.say)}>Repeat</button>
        <button type="button" className="rb" disabled={i === 0} onClick={() => { setI(i - 1); setAnswer(null); }}>Back</button>
        {!last && <button type="button" className="rb primary" onClick={() => { setI(i + 1); setAnswer(null); }}>Next</button>}
        {last && <button type="button" className="rb danger" disabled={busy} onClick={leaveWithoutPlan}>Leave</button>}
      </div>
      <p className="legal-note room-legal">{COUNSELOR.disclosure}</p>
    </div>
  );
}
