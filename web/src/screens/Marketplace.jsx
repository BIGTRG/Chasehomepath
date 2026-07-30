import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { market, assistance as assistanceApi } from '../api/client.js';
import ScreenTop from '../components/ScreenTop.jsx';

const usd = (n) => `$${Number(n ?? 0).toLocaleString()}`;
const TABS = [
  { key: 'house', label: 'Homes' },
  { key: 'lot', label: 'Lots' },
  { key: 'plans', label: 'Build' },
];

const SRC = {
  owned: { cls: 'own', label: 'CHASE owned' },
  optioned: { cls: 'own', label: 'CHASE optioned' },
  partner: { cls: 'ptr', label: 'Partner' },
  mls: { cls: 'mls', label: 'MLS' },
};

// Walkthrough screen 13: member-only inventory, source-labeled, priced with the
// member's assistance stack applied. (spec §4.14)
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
      <ScreenTop title="Marketplace" sub="Matched to your plan" />

      {assist && assist.total > 0 && (
        <div className="note">
          You may qualify for about <strong>{usd(assist.total)}</strong> across {assist.eligible.length} assistance
          program{assist.eligible.length === 1 ? '' : 's'} — already applied to the estimates below.
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
              <span className="pill n">{p.sqft} sq ft</span>
            </div>
            <div className="item-meta">{p.beds} bd · {p.baths} ba · build {usd(p.estBuildLow)}–{usd(p.estBuildHigh)}</div>
            <div className="link-orange" style={{ display: 'inline-block', marginTop: 8, fontSize: 13 }}>
              See every lot it fits — all-in ›
            </div>
          </Link>
        ))
      ) : (
        !listings ? <div className="loading">Loading…</div> :
        listings.length === 0 ? <div className="card muted-card">No listings here yet.</div> :
        listings.map((l) => {
          const src = SRC[l.source] || { cls: 'mls', label: l.sourceLabel };
          return (
            <div key={l.id} className="card">
              <div className={`thumb ${l.type === 'lot' ? 'l' : ''}`}>
                <span className="tbadge fit">Fits your plan</span>
              </div>
              <span className={`src ${src.cls}`}>{src.label}</span>
              <div className="item-creditor">{l.address}</div>
              <div className="item-meta">
                {l.type === 'house'
                  ? `${l.beds} bd · ${l.baths} ba · ${l.sqft} sq ft`
                  : `${(l.sqft / 43560).toFixed(2)} ac lot`}
              </div>
              <div className="price">{usd(l.price)}</div>
              {l.estMonthly && <div className="est">Est. {usd(l.estMonthly)}/mo with your assistance</div>}
            </div>
          );
        })
      )}
    </div>
  );
}
