import { useEffect, useState } from 'react';
import { operator } from '../../api/client.js';
import { useAuth } from '../../auth/AuthContext.jsx';

const TITLES = [
  ['home_specialist', 'Home specialist'], ['credit_specialist', 'Credit specialist'], ['budget_specialist', 'Budget specialist'],
  ['realestate_specialist', 'Real estate specialist'], ['manager', 'Manager'],
];
const ROLES = [['specialist', 'Specialist'], ['manager', 'Manager'], ['admin', 'Admin']];

// Team management (spec §5.3 capacity) + role editor (Deon, screen 24): a manager edits
// role, title, capacity target, and status in place. Admin grant is admin-only.
export default function TeamDash() {
  const { user } = useAuth();
  const [capacity, setCapacity] = useState(null);
  const [ratings, setRatings] = useState(null);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null); // userId
  const [draft, setDraft] = useState({});
  const [saving, setSaving] = useState(false);

  const load = () => operator.capacity().then((d) => setCapacity(d.capacity)).catch((e) => setError(e.message));
  useEffect(() => {
    load();
    operator.ratings().then((d) => setRatings(d.ratings)).catch(() => setRatings([]));
  }, []);

  if (error) return <div className="error">{error}</div>;

  function startEdit(c) {
    setEditing(c.userId);
    setDraft({ role: c.role, title: c.title, capacityTarget: c.capacityTarget, status: c.status });
    setError(null);
  }
  async function save(c) {
    setSaving(true);
    try {
      const body = {};
      for (const k of ['role', 'title', 'status']) if (draft[k] !== c[k]) body[k] = draft[k];
      if (Number(draft.capacityTarget) !== c.capacityTarget) body.capacityTarget = Number(draft.capacityTarget);
      if (Object.keys(body).length) await operator.patchStaff(c.userId, body);
      setEditing(null);
      await load();
    } catch (e) { setError(e.message); } finally { setSaving(false); }
  }

  return (
    <div>
      <h1 className="h1">Team</h1>
      <p className="sub">Click a row to edit role, title, capacity, or status. Changes take effect on the next request.</p>

      <div className="h2">Capacity</div>
      {!capacity ? <div className="loading">Loading…</div> : (
        <table className="op-table editable">
          <thead><tr><th>Staff</th><th>Role</th><th>Title</th><th>Clients</th><th>Target</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {capacity.map((c) => editing === c.userId ? (
              <tr key={c.userId} className="editing">
                <td>{c.email}</td>
                <td>
                  <select value={draft.role} disabled={c.userId === user.id} onChange={(e) => setDraft({ ...draft, role: e.target.value })}>
                    {ROLES.filter(([r]) => r !== 'admin' || user.role === 'admin').map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </td>
                <td>
                  <select value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })}>
                    {TITLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </td>
                <td>{c.clientCount}</td>
                <td><input type="number" min="1" max="60" value={draft.capacityTarget} onChange={(e) => setDraft({ ...draft, capacityTarget: e.target.value })} style={{ width: 64 }} /></td>
                <td>
                  <select value={draft.status} disabled={c.userId === user.id} onChange={(e) => setDraft({ ...draft, status: e.target.value })}>
                    <option value="active">Active</option><option value="suspended">Suspended</option>
                  </select>
                </td>
                <td className="op-actions">
                  <button className="btn small" disabled={saving} onClick={() => save(c)}>{saving ? 'Saving…' : 'Save'}</button>
                  <button className="link-btn" onClick={() => setEditing(null)}>Cancel</button>
                </td>
              </tr>
            ) : (
              <tr key={c.userId} onClick={() => startEdit(c)} className="clickable">
                <td>{c.email}</td>
                <td>{c.role}</td>
                <td>{TITLES.find(([v]) => v === c.title)?.[1] ?? c.title}</td>
                <td>{c.clientCount}</td>
                <td>{c.capacityTarget}</td>
                <td><span className={`hbadge ${c.status === 'active' ? (c.flag === 'over' ? 'red' : c.flag === 'under' ? 'amber' : 'green') : 'red'}`}>{c.status === 'active' ? c.flag : c.status}</span></td>
                <td><button className="link-btn" onClick={(e) => { e.stopPropagation(); startEdit(c); }}>Edit</button></td>
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
                <td>{r.email}</td><td>{r.avgScore}</td><td>{r.ratingCount}</td>
                <td>{r.flagged && <span className="hbadge red">low</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
