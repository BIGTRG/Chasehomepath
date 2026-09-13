import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { learn as learnApi, journey as journeyApi } from '../api/client.js';
import ScreenTop from '../components/ScreenTop.jsx';

const PHASES = [
  { key: 'before', label: 'Before you buy' },
  { key: 'during', label: 'During your purchase' },
  { key: 'after', label: 'After you own it' },
];

// Walkthrough screen 12: curriculum assigned from the plan, not browsed. Modules lock
// until needed. "Now" leads with the current module. (spec §4.13)
export default function Learn() {
  const [data, setData] = useState(null);
  const [sched, setSched] = useState(null);
  const [error, setError] = useState(null);

  async function load() {
    try {
      const [d, s] = await Promise.all([learnApi.mine(), journeyApi.training().catch(() => null)]);
      setData(d); setSched(s);
    } catch (err) {
      setError(err.message);
    }
  }
  useEffect(() => { load(); }, []);
  const slotFor = (moduleId) => sched?.sessions?.find((x) => x.moduleId === moduleId && ['approved', 'failed', 'proposed'].includes(x.status));
  const fmt = (iso) => new Date(iso).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

  if (error) return <div className="content"><div className="error">{error}</div></div>;
  if (!data) return <div className="loading">Loading…</div>;

  // "Now" = the first available module across all phases.
  const all = PHASES.flatMap((p) => data.groups[p.key]);
  const current = all.find((m) => m.status === 'available');

  return (
    <div className="content">
      <ScreenTop title="Your curriculum" sub={sched?.sessions?.length ? 'On your approved schedule' : 'Assigned from your plan'} right={<Link className="link" to="/start/training">Schedule</Link>} />

      {sched?.next && (
        <Link to={`/learn/${sched.next.moduleId}`} className="card item-card hl">
          <div className="item-top"><span className="item-creditor">Next lesson: {sched.next.title}</span><span className="chev">›</span></div>
          <div className="item-meta">{fmt(sched.next.scheduledAt)} · {sched.next.durationMin} min · opens 15 minutes before</div>
        </Link>
      )}
      {sched && sched.sessions.length === 0 && (
        <Link to="/start/training" className="card item-card hl">
          <div className="item-top"><span className="item-creditor">Set your training schedule</span><span className="chev">›</span></div>
          <div className="item-meta">Lessons run at times you approve, with an alert when each one starts.</div>
        </Link>
      )}

      {current && (
        <>
          <div className="lbl">Now</div>
          <div className="card hl">
            <div className="item-top">
              <div>
                <div className="item-creditor">{current.title}</div>
                <div className="item-meta">{current.durationMin} min</div>
              </div>
              <Link className="btn small" to={`/learn/${current.moduleId}`}>{slotFor(current.moduleId) ? fmt(slotFor(current.moduleId).scheduledAt) : 'Open'}</Link>
            </div>
          </div>
        </>
      )}

      {PHASES.map((phase) => {
        const mods = data.groups[phase.key].filter((m) => m !== current);
        if (mods.length === 0) return null;
        return (
          <div key={phase.key}>
            <div className="lbl">{phase.label}</div>
            {mods.map((m) => (
              <div className={`card module ${m.status === 'locked' ? 'dim' : ''}`} key={m.moduleId}>
                <div>
                  <div className="module-title">{m.title}</div>
                  <div className="item-meta">{m.durationMin} min</div>
                </div>
                {m.status === 'done' ? (
                  <span className="pill g">Done</span>
                ) : m.status === 'available' ? (
                  <Link className="btn small" to={`/learn/${m.moduleId}`}>{slotFor(m.moduleId) ? fmt(slotFor(m.moduleId).scheduledAt) : 'Open'}</Link>
                ) : (
                  <span className="pill n">Locked</span>
                )}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
