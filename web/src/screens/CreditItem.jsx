import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { credit as creditApi } from '../api/client.js';

// Credit item detail (spec §4.9): the engine explains the finding + the member's FCRA
// rights. Nothing is pre-selected. The member clicks to dispute. No outcome promises.
export default function CreditItem() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await creditApi.item(id));
    } catch (err) {
      setError(err.message);
    }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  async function fileDispute() {
    setBusy(true);
    setError(null);
    try {
      await creditApi.dispute(id);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function withdraw(disputeId) {
    setBusy(true);
    try {
      await creditApi.withdraw(disputeId);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (error) return <div className="content"><div className="error">{error}</div></div>;
  if (!data) return <div className="loading">Loading…</div>;

  const { item, rights, hasOpenDispute, canDispute, disputes } = data;
  const openDispute = disputes.find((d) => ['draft', 'filed', 'investigating'].includes(d.status));

  return (
    <div className="content">
      <button className="btn secondary back" onClick={() => navigate('/credit')}>← Credit</button>
      <h1 className="h1">{item.creditor}</h1>
      <div className="item-meta">
        {item.type} · reported ${Number(item.balance ?? 0).toLocaleString()}
        {item.member_recorded_balance != null && (
          <> · you recorded ${Number(item.member_recorded_balance).toLocaleString()}</>
        )}
      </div>
      <span className={`badge ${item.classification}`} style={{ marginTop: 10, display: 'inline-block' }}>
        {item.classification}
      </span>

      <div className="card">
        <div className="h2" style={{ marginTop: 0 }}>What the engine found</div>
        <p style={{ margin: 0 }}>{item.guidance_text}</p>
      </div>

      <div className="card">
        <div className="h2" style={{ marginTop: 0 }}>Your rights</div>
        <ul className="rights">
          {rights.map((r, i) => <li key={i}>{r}</li>)}
        </ul>
      </div>

      {canDispute ? (
        hasOpenDispute ? (
          <div className="card">
            <p style={{ marginTop: 0 }}>
              You filed a dispute on this item{openDispute ? ` (day ${openDispute.day_count})` : ''}. It's in progress.
            </p>
            <button className="btn secondary" onClick={() => withdraw(openDispute.id)} disabled={busy}>
              Withdraw dispute
            </button>
          </div>
        ) : (
          <button className="btn" onClick={fileDispute} disabled={busy}>
            {busy ? 'Filing…' : 'Dispute this item'}
          </button>
        )
      ) : (
        <div className="card muted-card">
          This item looks accurate, so a dispute isn't the right tool. Talk with your specialist about the options above.
        </div>
      )}
    </div>
  );
}
