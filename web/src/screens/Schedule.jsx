import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { intake as intakeApi } from '../api/client.js';
import ScreenTop from '../components/ScreenTop.jsx';

const fmtSlot = (iso) => {
  const d = new Date(iso);
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const sameDay = (a, b) => a.toDateString() === b.toDateString();
  const day = sameDay(d, tomorrow)
    ? 'Tomorrow'
    : d.toLocaleDateString('en-US', { weekday: 'short' });
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${day} · ${time}`;
};

// Walkthrough screen 4: two options, office pushed as primary. Booking fires the
// document checklist so the meeting is short. (spec §4.5)
export default function Schedule() {
  const navigate = useNavigate();
  const [slots, setSlots] = useState(null);
  const [type, setType] = useState('in_person');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    intakeApi.slots().then((d) => setSlots(d.slots)).catch((e) => setError(e.message));
  }, []);

  async function book(slot) {
    setBusy(true);
    setError(null);
    try {
      await intakeApi.book({ type, scheduledAt: slot });
      navigate('/prep');
    } catch (err) {
      setError(err.message || 'Could not book that time');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="content">
      <ScreenTop title="Choose your visit" sub="Raleigh office" />

      {error && <div className="error">{error}</div>}

      <button type="button" className={`opt ${type === 'in_person' ? 'sel' : ''}`} onClick={() => setType('in_person')}>
        <span>
          <span className="n">In person · recommended</span>
          <span className="s" style={{ display: 'block' }}>Meet your team, leave with a plan</span>
        </span>
        {type === 'in_person' && <span className="dot-sel" />}
      </button>
      <button type="button" className={`opt ${type === 'video' ? 'sel' : ''}`} onClick={() => setType('video')}>
        <span>
          <span className="n">Video meeting</span>
          <span className="s" style={{ display: 'block' }}>Same plan, from home</span>
        </span>
        {type === 'video' && <span className="dot-sel" />}
      </button>

      <div className="lbl">Open times</div>
      {!slots && <div className="loading">Loading times…</div>}
      {slots && slots.slice(0, 3).map((s) => (
        <div className="chk-row" key={s}>
          <span style={{ fontWeight: 500 }}>{fmtSlot(s)}</span>
          <button className="btn small" onClick={() => book(s)} disabled={busy}
            style={{ background: 'var(--tint)', color: 'var(--orange-dark)' }}>
            Book
          </button>
        </div>
      ))}

      <div className="note" style={{ marginTop: 8 }}>
        A consultation fee applies to reserve your time. It goes toward your plan.
      </div>
    </div>
  );
}
