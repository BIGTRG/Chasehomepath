import { useEffect, useState } from 'react';
import { onboarding } from '../../api/client.js';

// Onboarding queue (spec §5.4): new hires/contractors/partners moving through the gated
// pipeline. Steps advance; the case completes only when every step passes.
export default function Onboarding() {
  const [queue, setQueue] = useState(null);
  const [active, setActive] = useState(null);
  const [error, setError] = useState(null);

  async function loadQueue() {
    try { setQueue((await onboarding.queue()).queue); } catch (e) { setError(e.message); }
  }
  useEffect(() => { loadQueue(); }, []);

  async function openCase(id) {
    setError(null);
    try { setActive(await onboarding.getCase(id)); } catch (e) { setError(e.message); }
  }

  async function advance(stepId, decision) {
    setError(null);
    try {
      await onboarding.advance(stepId, decision);
      await openCase(active.case.id);
      await loadQueue();
    } catch (e) { setError(e.message); }
  }

  return (
    <div>
      <h1 className="h1">Onboarding</h1>
      {error && <div className="error">{error}</div>}

      <div className="op-grid">
        <div>
          <div className="h2" style={{ marginTop: 0 }}>Queue</div>
          {!queue ? <div className="loading">Loading…</div> : (
            <table className="op-table">
              <thead><tr><th>Person</th><th>Type</th><th>Stage</th><th>Progress</th></tr></thead>
              <tbody>
                {queue.map((c) => (
                  <tr key={c.id} onClick={() => openCase(c.id)} style={{ cursor: 'pointer' }}>
                    <td>{c.email}</td><td>{c.role_type}</td>
                    <td><span className={`hbadge ${c.stage === 'complete' ? 'green' : 'amber'}`}>{c.stage}</span></td>
                    <td>{c.passed}/{c.total}</td>
                  </tr>
                ))}
                {queue.length === 0 && <tr><td colSpan="4" className="muted-card">No cases in flight.</td></tr>}
              </tbody>
            </table>
          )}
        </div>

        <div>
          <div className="h2" style={{ marginTop: 0 }}>Case detail</div>
          {!active ? <div className="card muted-card">Select a case to advance its steps.</div> : (
            <div className="card">
              <div className="op-row"><strong>{active.case.email}</strong><span className={`hbadge ${active.case.stage === 'complete' ? 'green' : 'amber'}`}>{active.case.stage}</span></div>
              {active.steps.map((s) => (
                <div className="op-row" key={s.id}>
                  <span>{s.step.replace('_', ' ')}</span>
                  <span className="op-actions">
                    <span className={`hbadge ${s.status === 'passed' ? 'green' : s.status === 'failed' ? 'red' : 'amber'}`}>{s.status}</span>
                    {s.status !== 'passed' && (
                      <>
                        <button className="btn small" onClick={() => advance(s.id, 'pass')}>Pass</button>
                        <button className="btn small secondary" onClick={() => advance(s.id, 'fail')}>Fail</button>
                      </>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
