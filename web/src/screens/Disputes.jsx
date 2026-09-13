import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { credit as creditApi } from '../api/client.js';
import { COUNSELOR } from '../brand.js';

const fmt = (d) => (d ? new Date(String(d).length === 10 ? `${d}T12:00:00` : d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '');

// Dispute tracker: every case the member opened, with Maren's next step on each.
export default function Disputes() {
  const [cases, setCases] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => { creditApi.cases().then((d) => setCases(d.cases)).catch((e) => setError(e.message)); }, []);

  if (error) return <div className="content"><div className="error">{error}</div></div>;
  if (!cases) return <div className="loading">Loading…</div>;

  return (
    <div className="content">
      <h1 className="h1">Your disputes</h1>
      <p className="sub">Every one started by you. {COUNSELOR.name} drafts and tracks; you sign and send.</p>

      {cases.length === 0 && <div className="card muted-card">No disputes yet. Open any item marked "Look inaccurate" on your Credit tab to start one.</div>}

      {cases.map((c) => (
        <Link to={`/credit/cases/${c.id}`} className="card" key={c.id} style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}>
          <div className="item-top">
            <span className="item-creditor">{c.creditor}</span>
            <span className={`badge status-${c.status}`}>{c.status === 'resolved' ? c.outcome : c.status}</span>
          </div>
          <div className="item-meta">{c.reasonLabel} · round {c.round}{c.dueAt && ['filed', 'investigating'].includes(c.status) ? ` · answer by ${fmt(c.dueAt)} · day ${c.dayCount}` : ''}</div>
          <div className="s" style={{ marginTop: 6, color: 'var(--orange-dark)', fontWeight: 600 }}>{c.next.title} ›</div>
        </Link>
      ))}
    </div>
  );
}
