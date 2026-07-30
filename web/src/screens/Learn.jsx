import { useEffect, useState } from 'react';
import { learn as learnApi } from '../api/client.js';
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

  // "Now" = the first available module across all phases.
  const all = PHASES.flatMap((p) => data.groups[p.key]);
  const current = all.find((m) => m.status === 'available');

  return (
    <div className="content">
      <ScreenTop title="Your curriculum" sub="Assigned from your plan" />

      {current && (
        <>
          <div className="lbl">Now</div>
          <div className="card hl">
            <div className="item-top">
              <div>
                <div className="item-creditor">{current.title}</div>
                <div className="item-meta">{current.durationMin} min</div>
              </div>
              <button className="btn small" onClick={() => complete(current.moduleId)}>Mark done</button>
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
                  <button className="btn small" onClick={() => complete(m.moduleId)}>Mark done</button>
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
