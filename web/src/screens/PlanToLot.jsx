import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { market } from '../api/client.js';

const usd = (n) => `$${Number(n ?? 0).toLocaleString()}`;

// Plan-to-lot (spec §4.15): pick a plan, see fitting lots with the all-in (lot + build) number.
export default function PlanToLot() {
  const { planId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    market.planLots(planId).then(setData).catch((e) => setError(e.message));
  }, [planId]);

  if (error) return <div className="content"><div className="error">{error}</div></div>;
  if (!data) return <div className="loading">Loading…</div>;

  return (
    <div className="content">
      <button className="btn secondary back" onClick={() => navigate('/marketplace')}>← Marketplace</button>
      <h1 className="h1">{data.plan.name}</h1>
      <p className="sub">{data.plan.beds} bd · {data.plan.baths} ba · {data.plan.sqft} sqft — fitting lots below.</p>

      {data.matches.length === 0 && <div className="card muted-card">No fitting lots available right now.</div>}

      {data.matches.map((m) => (
        <div key={m.lot.id} className="card">
          <div className="item-top">
            <span className="item-creditor">{usd(m.allIn)} all-in</span>
            <span className={`badge src-${m.lot.source}`}>{m.lot.sourceLabel}</span>
          </div>
          <div className="item-meta">{m.lot.address}</div>
          <div className="item-meta">
            Lot {usd(m.lot.price)} + build · {m.lot.sqft} sqft lot
            {m.estMonthly ? ` · ~${usd(m.estMonthly)}/mo est.` : ''}
          </div>
          <div className="item-guidance">{m.fit.reason}</div>
        </div>
      ))}
    </div>
  );
}
