import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { credit as creditApi } from '../api/client.js';
import ScreenTop from '../components/ScreenTop.jsx';

// Walkthrough screen 8: the engine explains the rule and the rights — nothing
// pre-selected. The member chooses and clicks submit. That's what keeps it DIY. (§4.9)
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
  const typeLabel = String(item.type || '').replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

  return (
    <div className="content">
      <ScreenTop
        title={item.creditor}
        sub={`${typeLabel} · $${Number(item.balance ?? 0).toLocaleString()}`}
      />

      <div className="detail-lbl">What we found</div>
      <p className="detail-p">
        {item.guidance_text}
        {item.member_recorded_balance != null && (
          <> The balance reported is ${Number(item.balance ?? 0).toLocaleString()}. Your records
          show ${Number(item.member_recorded_balance).toLocaleString()}.</>
        )}
      </p>

      <div className="detail-lbl">Your right</div>
      <ul className="rights">
        {rights.map((r, i) => <li key={i}>{r}</li>)}
      </ul>

      <div className="gy" style={{ marginTop: 16 }}>
        This is your decision. We've shown you what we found and your rights — you choose
        whether to dispute. We don't promise an outcome.
      </div>

      {canDispute ? (
        hasOpenDispute ? (
          <div className="card">
            <p style={{ marginTop: 0, fontSize: 14 }}>
              You filed a dispute on this item{openDispute ? ` (day ${openDispute.day_count})` : ''}. It's in progress.
            </p>
            <button className="btn secondary" onClick={() => withdraw(openDispute.id)} disabled={busy}>
              Withdraw dispute
            </button>
          </div>
        ) : (
          <button className="btn" onClick={fileDispute} disabled={busy}>
            {busy ? 'Filing…' : 'I want to dispute this'}
          </button>
        )
      ) : (
        <div className="card muted-card">
          This item looks accurate, so a dispute isn't the right tool. Talk with your specialist about the options above.
        </div>
      )}

      <button className="btn secondary" onClick={() => navigate('/credit')}>
        Not now — back to credit
      </button>
    </div>
  );
}
