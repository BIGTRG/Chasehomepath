import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { operator } from '../../api/client.js';

// Client roster (spec §5.1): filterable by plan status / track health.
export default function Roster() {
  const [rows, setRows] = useState(null);
  const [health, setHealth] = useState('');
  const [error, setError] = useState(null);

  useEffect(() => {
    operator.roster({ health }).then((d) => setRows(d.roster)).catch((e) => setError(e.message));
  }, [health]);

  return (
    <div>
      <h1 className="h1">Clients</h1>
      <div className="op-filters">
        {['', 'green', 'amber', 'red'].map((h) => (
          <button key={h || 'all'} className={health === h ? 'chip active' : 'chip'} onClick={() => setHealth(h)}>
            {h || 'all'}
          </button>
        ))}
      </div>

      {error && <div className="error">{error}</div>}
      {!rows ? <div className="loading">Loading…</div> : (
        <table className="op-table">
          <thead><tr><th>Member</th><th>Plan</th><th>Day</th><th>Progress</th><th>Health</th><th>Team</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.memberId}>
                <td><Link to={`/clients/${r.memberId}`}>{r.email}</Link></td>
                <td>{r.planStatus}</td>
                <td>{r.planDay}</td>
                <td>{r.avgProgress}%</td>
                <td><span className={`hbadge ${r.health}`}>{r.health}</span></td>
                <td>{r.teamSize}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan="6" className="muted-card">No clients.</td></tr>}
          </tbody>
        </table>
      )}
    </div>
  );
}
