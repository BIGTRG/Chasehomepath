import { useEffect, useState } from 'react';
import { operator } from '../../api/client.js';

// Team management (spec §5.3 capacity) + ratings dashboard (spec §5.6 flag low performers).
export default function TeamDash() {
  const [capacity, setCapacity] = useState(null);
  const [ratings, setRatings] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    operator.capacity().then((d) => setCapacity(d.capacity)).catch((e) => setError(e.message));
    operator.ratings().then((d) => setRatings(d.ratings)).catch(() => setRatings([]));
  }, []);

  if (error) return <div className="error">{error}</div>;

  return (
    <div>
      <h1 className="h1">Team</h1>

      <div className="h2">Capacity (target 10–12 clients)</div>
      {!capacity ? <div className="loading">Loading…</div> : (
        <table className="op-table">
          <thead><tr><th>Specialist</th><th>Title</th><th>Clients</th><th>Status</th></tr></thead>
          <tbody>
            {capacity.map((c) => (
              <tr key={c.userId}>
                <td>{c.email}</td><td>{c.title}</td><td>{c.clientCount}</td>
                <td><span className={`hbadge ${c.flag === 'over' ? 'red' : c.flag === 'under' ? 'amber' : 'green'}`}>{c.flag}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="h2">Responsiveness ratings</div>
      {!ratings ? <div className="loading">Loading…</div> : ratings.length === 0 ? (
        <div className="card muted-card">No ratings yet.</div>
      ) : (
        <table className="op-table">
          <thead><tr><th>Staff</th><th>Avg</th><th>Ratings</th><th></th></tr></thead>
          <tbody>
            {ratings.map((r) => (
              <tr key={r.userId} className={r.flagged ? 'flagged' : ''}>
                <td>{r.email}</td><td>★ {r.avgScore}</td><td>{r.ratingCount}</td>
                <td>{r.flagged && <span className="hbadge red">low</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
