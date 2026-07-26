import { useEffect, useState } from 'react';
import { operator } from '../../api/client.js';

// HQ admin board (spec §5.7): user/role administration + program config.
export default function Admin() {
  const [users, setUsers] = useState(null);
  const [programs, setPrograms] = useState(null);
  const [error, setError] = useState(null);

  async function load() {
    try {
      setUsers((await operator.users()).users);
      setPrograms((await operator.programs()).programs);
    } catch (e) { setError(e.message); }
  }
  useEffect(() => { load(); }, []);

  async function toggleStatus(u) {
    const status = u.status === 'active' ? 'suspended' : 'active';
    await operator.patchUser(u.id, { status });
    load();
  }

  if (error) return <div className="error">{error}</div>;

  return (
    <div>
      <h1 className="h1">HQ Admin</h1>

      <div className="h2">Users</div>
      {!users ? <div className="loading">Loading…</div> : (
        <table className="op-table">
          <thead><tr><th>Email</th><th>Role</th><th>Status</th><th>MFA</th><th></th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.email}</td><td>{u.role}</td>
                <td><span className={`hbadge ${u.status === 'active' ? 'green' : 'red'}`}>{u.status}</span></td>
                <td>{u.mfa_enabled ? 'on' : 'off'}</td>
                <td><button className="btn small secondary" onClick={() => toggleStatus(u)}>
                  {u.status === 'active' ? 'Suspend' : 'Activate'}
                </button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="h2">Assistance programs</div>
      {!programs ? <div className="loading">Loading…</div> : (
        <table className="op-table">
          <thead><tr><th>Name</th><th>Source</th><th>Active</th><th>Rules</th></tr></thead>
          <tbody>
            {programs.map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td><td>{p.source}</td>
                <td>{p.active ? 'yes' : 'no'}</td>
                <td><code className="rules">{JSON.stringify(p.rules_json)}</code></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
