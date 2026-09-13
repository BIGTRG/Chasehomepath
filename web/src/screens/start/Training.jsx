import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { journey as journeyApi } from '../../api/client.js';
import ScreenTop from '../../components/ScreenTop.jsx';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const HOURS = [7, 8, 12, 17, 18, 19, 20, 21];
const fmt = (iso) => new Date(iso).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const hourLabel = (h) => `${((h + 11) % 12) + 1}:00 ${h >= 12 ? 'PM' : 'AM'}`;

// Step 6: training on a schedule the member approves. One short lesson per slot, an
// alert at start time, and a three-question check at the end.
export default function Training() {
  const navigate = useNavigate();
  const [sched, setSched] = useState(null);
  const [days, setDays] = useState(['Mon', 'Wed', 'Fri']);
  const [hour, setHour] = useState(19);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const load = () => journeyApi.training().then(setSched).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  async function propose() {
    setBusy(true); setError(null);
    try { await journeyApi.propose({ days, hour, minute: 0 }); await load(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function approve() {
    setBusy(true); setError(null);
    try { await journeyApi.approve(); await load(); navigate('/money/setup'); } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  if (error && !sched) return <div className="content"><div className="error">{error}</div></div>;
  if (!sched) return <div className="loading">Loading…</div>;
  const proposed = sched.sessions.filter((s) => s.status === 'proposed');
  const approved = sched.sessions.filter((s) => s.status !== 'proposed');

  return (
    <div className="content">
      <ScreenTop title="Your training schedule" sub="Step 6 of 7" right={<Link className="link" to="/">Plan</Link>} />
      <p className="s" style={{ marginTop: 0, lineHeight: 1.5 }}>Lessons run on a schedule, not whenever. Pick your days and time, approve the calendar, and we alert you when each lesson starts. Each one is 8 to 20 minutes and ends with a three-question check you need to pass.</p>
      {error && <div className="error">{error}</div>}

      <div className="card">
        <div className="lbl" style={{ marginTop: 0 }}>Days</div>
        <div className="chips">{DAYS.map((d) => <button type="button" key={d} className={`chip ${days.includes(d) ? 'on' : ''}`} onClick={() => setDays((x) => x.includes(d) ? x.filter((y) => y !== d) : [...x, d])}>{d}</button>)}</div>
        <div className="lbl">Time, Raleigh</div>
        <div className="chips">{HOURS.map((h) => <button type="button" key={h} className={`chip ${hour === h ? 'on' : ''}`} onClick={() => setHour(h)}>{hourLabel(h)}</button>)}</div>
        <button type="button" className="btn outline" disabled={busy || days.length === 0} onClick={propose} style={{ marginTop: 10 }}>{proposed.length ? 'Re-propose' : 'Propose my schedule'}</button>
      </div>

      {proposed.length > 0 && (
        <>
          <div className="h2">Proposed, {proposed.length} lessons</div>
          <div className="card list">{proposed.map((s) => <div key={s.id} className="row"><div className="grow"><div className="n">{s.title}</div><div className="s">{fmt(s.scheduledAt)} · {s.durationMin} min</div></div></div>)}</div>
          <button type="button" className="btn" disabled={busy} onClick={approve}>Approve this schedule</button>
        </>
      )}
      {approved.length > 0 && proposed.length === 0 && (
        <>
          <div className="h2">On your calendar</div>
          <div className="card list">{approved.map((s) => <div key={s.id} className="row"><div className="grow"><div className="n">{s.title}</div><div className="s">{fmt(s.scheduledAt)}</div></div><span className={`pill ${s.status === 'passed' ? 'g' : s.status === 'failed' || s.status === 'missed' ? 'n' : 'w'}`}>{s.status}</span></div>)}</div>
        </>
      )}
    </div>
  );
}
