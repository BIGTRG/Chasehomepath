import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { intake as intakeApi, journey as journeyApi } from '../../api/client.js';
import ScreenTop from '../../components/ScreenTop.jsx';
import { COUNSELOR } from '../../brand.js';

const fmtSlot = (iso) => {
  const d = new Date(iso);
  return `${d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} · ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
};

// Step 4: two clear choices, same agenda. Maren now on video, or a person at the next slot.
export default function Book() {
  const navigate = useNavigate();
  const [choice, setChoice] = useState('maren');
  const [type, setType] = useState('video');
  const [slots, setSlots] = useState(null);
  const [gate, setGate] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    intakeApi.slots().then((d) => setSlots(d.slots)).catch((e) => setError(e.message));
    journeyApi.status().then((s) => setGate(s.docsGate)).catch(() => setGate({ complete: true }));
  }, []);

  async function startMaren() {
    setBusy(true); setError(null);
    try { const { meeting } = await journeyApi.startMeeting(); navigate(`/meet/maren/${meeting.id}`); } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function book(slot) {
    setBusy(true); setError(null);
    try { await intakeApi.book({ type, scheduledAt: slot }); navigate('/start'); } catch (e) { setError(e.message || 'Could not book that time'); } finally { setBusy(false); }
  }

  return (
    <div className="content">
      <ScreenTop title="Book your meeting" sub="Step 4 of 6, about 20 minutes" />
      {error && <div className="error">{error}</div>}
      {gate && !gate.complete && <div className="note">Finish your documents first so your counselor has your full file. <button type="button" className="link" style={{ background: 'none', border: 0, font: 'inherit', padding: 0 }} onClick={() => navigate('/start/docs')}>Back to documents</button></div>}

      <button type="button" className={`opt ${choice === 'maren' ? 'sel' : ''}`} onClick={() => setChoice('maren')}>
        <span>
          <span className="n">Meet {COUNSELOR.name} now · on video</span>
          <span className="s" style={{ display: 'block' }}>Your counselor, available this minute. Goes through your credit, where you stand, and your two best plans. {COUNSELOR.name} is a virtual counselor, not a person.</span>
        </span>
        {choice === 'maren' && <span className="dot-sel" />}
      </button>
      <button type="button" className={`opt ${choice === 'person' ? 'sel' : ''}`} onClick={() => setChoice('person')}>
        <span>
          <span className="n">Meet a live specialist</span>
          <span className="s" style={{ display: 'block' }}>A person on our team, on video or in the Raleigh office, at the next open time. Same agenda.</span>
        </span>
        {choice === 'person' && <span className="dot-sel" />}
      </button>

      {choice === 'maren' ? (
        <>
          <div className="card soft" style={{ marginTop: 10 }}>
            <div className="n">What happens in the room</div>
            <ul className="plan-feats"><li>Your credit report, item by item</li><li>FHA, USDA, VA, conventional: where you stand today</li><li>How the program works</li><li>Your two best plans, and you start one before you leave</li></ul>
          </div>
          <button type="button" className="btn" disabled={busy || (gate && !gate.complete)} onClick={startMaren} style={{ marginTop: 10 }}>{busy ? 'Opening your room…' : `Start with ${COUNSELOR.name}`}</button>
        </>
      ) : (
        <>
          <div className="lbl">Format</div>
          <div className="seg"><button type="button" className={type === 'video' ? 'on' : ''} onClick={() => setType('video')}>Video</button><button type="button" className={type === 'in_person' ? 'on' : ''} onClick={() => setType('in_person')}>In office</button></div>
          <div className="lbl">Open times, Raleigh</div>
          {!slots && <div className="loading">Loading times…</div>}
          {slots && slots.slice(0, 4).map((s) => (
            <div className="chk-row" key={s}><span style={{ fontWeight: 500 }}>{fmtSlot(s)}</span><button className="btn small" onClick={() => book(s)} disabled={busy || (gate && !gate.complete)} style={{ background: 'var(--tint)', color: 'var(--orange-dark)' }}>Book</button></div>
          ))}
        </>
      )}
    </div>
  );
}
