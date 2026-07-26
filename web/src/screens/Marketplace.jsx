import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { market, assistance as assistanceApi } from '../api/client.js';

const usd = (n) => `$${Number(n ?? 0).toLocaleString()}`;
const TABS = [
  { key: 'house', label: 'Homes' },
  { key: 'lot', label: 'Lots' },
  { key: 'plans', label: 'Build' },
];

// Marketplace (spec §4.14): houses/lots/plans, SOURCE-LABELED, priced with the member's
// assistance applied. Every listing shows where it came from.
export default function Marketplace() {
  const [tab, setTab] = useState('house');
  const [listings, setListings] = useState(null);
  const [plans, setPlans] = useState(null);
  const [assist, setAssist] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    assistanceApi.mine().then(setAssist).catch(() => setAssist(null));
  }, []);

  useEffect(() => {
    setError(null);
    if (tab === 'plans') {
      market.plans().then((d) => setPlans(d.plans)).catch((e) => setError(e.message));
    } else {
      setListings(null);
      market.listings({ type: tab }).then((d) => setListings(d.listings)).catch((e) => setError(e.message));
    }
  }, [tab]);

  return (
    <div className="content">
      <h1 className="h1">Marketplace</h1>
      <p className="sub">Homes, lots, and build plans — priced with your assistance applied.</p>

      {assist && assist.total > 0 && (
        <div className="rule-banner ready" style={{ marginBottom: 16 }}>
          <span className="dot" />
          <span>
            You may qualify for about <strong>{usd(assist.total)}</strong> across {assist.eligible.length} assistance
            program{assist.eligible.length === 1 ? '' : 's'} — already applied to the estimates below.
          </span>
        </div>
      )}

      <div className="seg">
        {TABS.map((t) => (
          <button key={t.key} className={tab === t.key ? 'seg-btn active' : 'seg-btn'} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {error && <div className="error">{error}</div>}

      {tab === 'plans' ? (
        !plans ? <div className="loading">Loading…</div> :
        plans.map((p) => (
          <Link key={p.id} to={`/marketplace/plans/${p.id}`} className="card item-card">
            <div className="item-top">
              <span className="item-creditor">{p.name}</span>
              <span className="badge accurate">{p.sqft} sqft</span>
            </div>
            <div className="item-meta">{p.beds} bd · {p.baths} ba · build {usd(p.estBuildLow)}–{usd(p.estBuildHigh)}</div>
            <div className="item-guidance">See fitting lots and the all-in cost →</div>
          </Link>
        ))
      ) : (
        !listings ? <div className="loading">Loading…</div> :
        listings.length === 0 ? <div className="card muted-card">No listings here yet.</div> :
        listings.map((l) => (
          <div key={l.id} className="card">
            <div className="item-top">
              <span className="item-creditor">{usd(l.price)}</span>
              <span className={`badge src-${l.source}`}>{l.sourceLabel}</span>
            </div>
            <div className="item-meta">{l.address}</div>
            <div className="item-meta">
              {l.type === 'house'
                ? `${l.beds} bd · ${l.baths} ba · ${l.sqft} sqft${l.estMonthly ? ` · ~${usd(l.estMonthly)}/mo est.` : ''}`
                : `${l.sqft} sqft lot`}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
