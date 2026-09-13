import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { credit as creditApi } from '../api/client.js';
import ScreenTop from '../components/ScreenTop.jsx';
import { COUNSELOR } from '../brand.js';

// Walkthrough screen 8: the engine explains the rule and the rights — nothing
// pre-selected. The member chooses and clicks submit. That's what keeps it DIY. (§4.9)
export default function CreditItem() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      setData(await creditApi.item(id));
    } catch (err) {
      setError(err.message);
    }
  }, [id]);
  useEffect(() => { load(); }, [load]);

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
          <div className="card hl">
            <p style={{ marginTop: 0, fontSize: 14 }}>
              You have a dispute open on this item{openDispute?.status !== 'draft' ? ` (day ${openDispute.day_count})` : ''}. {COUNSELOR.name} has your next step.
            </p>
            <button className="btn" onClick={() => navigate(`/credit/cases/${openDispute.id}`)}>Open the case</button>
          </div>
        ) : (
          <button className="btn" onClick={() => navigate(`/credit/items/${id}/dispute`)}>
            I want to question this
          </button>
        )
      ) : (
        <div className="card muted-card">
          This item looks accurate, so a dispute isn't the right tool. Paying it down is the honest path; your paydown plan shows the order.
        </div>
      )}

      <button className="btn secondary" onClick={() => navigate('/credit')}>
        Not now — back to credit
      </button>
    </div>
  );
}
