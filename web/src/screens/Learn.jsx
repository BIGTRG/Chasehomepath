import { useEffect, useState } from 'react';
import { learn as learnApi } from '../api/client.js';

const PHASES = [
  { key: 'before', label: 'Before you buy' },
  { key: 'during', label: 'During your purchase' },
  { key: 'after', label: 'After you own it' },
];

// Learn (spec §4.13): assigned curriculum, locked until relevant, incl. the "after you
// own it" block. Modules unlock based on plan state.
export default function Learn() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  async function load() {
    try {
      setData(await learnApi.mine());
    } catch (err) {
      setError(err.message);
    }
  }
  useEffect(() => { load(); }, []);

  async function complete(moduleId) {
    try {
      await learnApi.complete(moduleId);
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  if (error) return <div className="content"><div className="error">{error}</div></div>;
  if (!data) return <div className="loading">Loading…</div>;

  return (
    <div className="content">
      <h1 className="h1">Learn</h1>
      <p className="sub">
        {data.progress.done} of {data.progress.total} complete · {data.progress.pct}%
      </p>
      <div className="bar" style={{ marginBottom: 18 }}>
        <span style={{ width: `${data.progress.pct}%` }} />
      </div>

      {PHASES.map((phase) => (
        <div key={phase.key}>
          <div className="h2">{phase.label}</div>
          {data.groups[phase.key].map((m) => (
            <div className={`card module ${m.status}`} key={m.moduleId}>
              <div className="module-main">
                <div className="module-title">
                  {m.status === 'locked' && <span className="lock" aria-hidden>🔒 </span>}
                  {m.title}
                </div>
                <div className="item-meta">{m.durationMin} min</div>
              </div>
              {m.status === 'done' ? (
                <span className="badge accurate">done</span>
              ) : m.status === 'available' ? (
                <button className="btn small" onClick={() => complete(m.moduleId)}>Mark done</button>
              ) : (
                <span className="badge status-withdrawn">locked</span>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
