import { useEffect, useState } from 'react';
import { credit as creditApi } from '../api/client.js';

// Dispute tracker (spec §4.11): all disputes with status + day count. Read-only list;
// members act on individual items from the credit detail screen.
export default function Disputes() {
  const [disputes, setDisputes] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    creditApi.disputes().then((d) => setDisputes(d.disputes)).catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="content"><div className="error">{error}</div></div>;
  if (!disputes) return <div className="loading">Loading…</div>;

  return (
    <div className="content">
      <h1 className="h1">Disputes</h1>
      <p className="sub">Every dispute here was started by you. We track each one's progress.</p>

      {disputes.length === 0 && (
        <div className="card muted-card">No disputes yet. You start them from a credit item.</div>
      )}

      {disputes.map((d) => (
        <div className="card" key={d.id}>
          <div className="item-top">
            <span className="item-creditor">{d.creditor}</span>
            <span className={`badge status-${d.status}`}>{d.status}</span>
          </div>
          <div className="item-meta">
            {d.type} · {d.method || 'online'} · filed {new Date(d.filed_at).toLocaleDateString()} · day {d.day_count}
          </div>
        </div>
      ))}
    </div>
  );
}
