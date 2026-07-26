import { useEffect, useState } from 'react';
import { operator, ingest } from '../../api/client.js';

const usd = (n) => `$${Number(n ?? 0).toLocaleString()}`;

// Inventory management (spec §5.5): add/retire listings; approve partner-submitted inventory.
export default function Inventory() {
  const [pending, setPending] = useState([]);
  const [active, setActive] = useState([]);
  const [msg, setMsg] = useState(null);
  const [error, setError] = useState(null);

  async function load() {
    try {
      setPending((await ingest.pending()).pending);
      setActive((await operator.inventory({ status: 'active' })).inventory);
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => { load(); }, []);

  async function review(id, decision) {
    setError(null);
    try {
      await ingest.review(id, decision);
      await load();
    } catch (e) { setError(e.message); }
  }
  async function retire(id) {
    try { await operator.retire(id); await load(); } catch (e) { setError(e.message); }
  }
  async function syncMls() {
    const r = await ingest.mls();
    setMsg(`MLS sync: ${r.inserted} added, ${r.skipped} dup, ${r.rejected} rejected.`);
    load();
  }

  return (
    <div>
      <h1 className="h1">Inventory</h1>
      <button className="btn small" onClick={syncMls}>Sync MLS feed</button>
      {msg && <div className="rule-banner ready" style={{ marginTop: 12 }}><span className="dot" />{msg}</div>}
      {error && <div className="error">{error}</div>}

      <div className="h2">Pending approval ({pending.length})</div>
      {pending.length === 0 && <div className="card muted-card">Nothing awaiting review.</div>}
      {pending.map((p) => (
        <div className="card op-row" key={p.id}>
          <div>
            <strong>{usd(p.price)}</strong> · {p.type} · <span className={`badge src-${p.source}`}>{p.source}</span>
            <div className="item-meta">{p.address} {p.company_name ? `· ${p.company_name} (${p.certification_status})` : ''}</div>
          </div>
          <div className="op-actions">
            <button className="btn small" onClick={() => review(p.id, 'approve')}>Approve</button>
            <button className="btn small secondary" onClick={() => review(p.id, 'reject')}>Reject</button>
          </div>
        </div>
      ))}

      <div className="h2">Active listings ({active.length})</div>
      {active.map((l) => (
        <div className="card op-row" key={l.id}>
          <div><strong>{usd(l.price)}</strong> · {l.type} · <span className={`badge src-${l.source}`}>{l.source}</span>
            <div className="item-meta">{l.address}</div>
          </div>
          <button className="btn small secondary" onClick={() => retire(l.id)}>Retire</button>
        </div>
      ))}
    </div>
  );
}
