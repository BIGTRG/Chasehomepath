import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { market, assistance as assistanceApi } from '../api/client.js';
import ScreenTop from '../components/ScreenTop.jsx';

const usd = (n) => `$${Number(n ?? 0).toLocaleString()}`;

// Walkthrough screen 14: the inverted flow. Pick the house, see every lot it fits —
// with the all-in number, lot plus build. (spec §4.15)
export default function PlanToLot() {
  const { planId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [assist, setAssist] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    market.planLots(planId).then(setData).catch((e) => setError(e.message));
    assistanceApi.mine().then(setAssist).catch(() => setAssist(null));
  }, [planId]);

  if (error) return <div className="content"><div className="error">{error}</div></div>;
  if (!data) return <div className="loading">Loading…</div>;

  return (
    <div className="content">
      <button className="btn secondary back" onClick={() => navigate('/marketplace')}>← Marketplace</button>
      <ScreenTop title="Plan to lot" sub={`${data.plan.name} · ${data.plan.sqft} sq ft`} />

      <div className="note">
        Pick the home you want — we show every lot that can take it, all-in.
      </div>

      {data.matches.length === 0 && <div className="card muted-card">No fitting lots available right now.</div>}

      {data.matches.map((m, i) => (
        <div key={m.lot.id} className={`card ${i === 0 ? 'gl' : ''}`}>
          {i === 0 && <span className="pill g" style={{ display: 'inline-block', marginBottom: 8 }}>Best match</span>}
          <div className="item-creditor">{m.lot.address}</div>
          <div className="item-meta">
            {(m.lot.sqft / 43560).toFixed(2)} ac{m.fit.reason ? ` · ${m.fit.reason}` : ''}
          </div>
          <div className="allin">{usd(m.allIn)} all in</div>
          <div className="item-meta">{usd(m.lot.price)} lot + {usd(m.allIn - m.lot.price)} build</div>
          {assist && assist.total > 0 && (
            <div className="assist-line">{usd(assist.total)} assistance applies</div>
          )}
          {m.estMonthly && <div className="est">Est. {usd(m.estMonthly)}/mo</div>}
        </div>
      ))}
    </div>
  );
}
