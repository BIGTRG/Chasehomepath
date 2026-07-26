import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { money as moneyApi } from '../api/client.js';

const usd = (n) => `$${Number(n ?? 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

// Money (spec §4.11): Plaid-linked spend/save view, specific coaching, dispute tracker link.
export default function Money() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      setData(await moneyApi.overview());
    } catch (err) {
      setError(err.message);
    }
  }
  useEffect(() => { load(); }, []);

  async function linkAndSync() {
    setBusy(true);
    setError(null);
    try {
      // In production the publicToken comes from Plaid Link; the mock accepts any string.
      await moneyApi.link('public-mock-token');
      await moneyApi.sync();
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (error) return <div className="content"><div className="error">{error}</div></div>;
  if (!data) return <div className="loading">Loading…</div>;

  return (
    <div className="content">
      <h1 className="h1">Money</h1>

      {!data.linked ? (
        <div className="card">
          <p style={{ marginTop: 0 }}>
            Link your bank to see spending, set budgets, and get specific coaching. Your
            connection is encrypted and your data is never sold.
          </p>
          <button className="btn" onClick={linkAndSync} disabled={busy}>
            {busy ? 'Linking…' : 'Link my bank'}
          </button>
        </div>
      ) : (
        <>
          <div className="card money-row">
            <Stat label="Income" value={usd(data.month.income)} />
            <Stat label="Spent" value={usd(data.month.spend)} />
            <Stat label="Net" value={usd(data.month.net)} accent={data.month.net >= 0 ? 'green' : 'danger'} />
          </div>

          {data.coaching.length > 0 && (
            <>
              <div className="h2">Coaching</div>
              {data.coaching.map((c, i) => (
                <div className={`card coach coach-${c.severity}`} key={i}>{c.message}</div>
              ))}
            </>
          )}

          <div className="h2">Budgets</div>
          {data.budgets.length === 0 && <div className="card muted-card">No budgets set yet.</div>}
          {data.budgets.map((b) => {
            const pct = Math.min(100, Math.round((b.actual / Math.max(1, b.monthly_target)) * 100));
            const over = b.actual > b.monthly_target;
            return (
              <div className="card" key={b.id}>
                <div className="track-top">
                  <span className="track-name">{b.category}</span>
                  <span className="track-pct">{usd(b.actual)} / {usd(b.monthly_target)}</span>
                </div>
                <div className="bar"><span className={over ? 'over' : ''} style={{ width: `${pct}%` }} /></div>
              </div>
            );
          })}

          <div className="h2">Savings goals</div>
          {data.savings.length === 0 && <div className="card muted-card">No savings goals yet.</div>}
          {data.savings.map((g) => {
            const pct = Math.min(100, Math.round((g.current_amount / Math.max(1, g.target_amount)) * 100));
            return (
              <div className="card" key={g.id}>
                <div className="track-top">
                  <span className="track-name">{g.label}</span>
                  <span className="track-pct">{usd(g.current_amount)} / {usd(g.target_amount)} · {pct}%</span>
                </div>
                <div className="bar"><span style={{ width: `${pct}%` }} /></div>
              </div>
            );
          })}
        </>
      )}

      <Link to="/disputes" className="card item-card">
        <div className="item-top">
          <span className="item-creditor">Dispute tracker →</span>
        </div>
        <div className="item-meta">Track credit disputes you've started.</div>
      </Link>
    </div>
  );
}

function Stat({ label, value, accent }) {
  return (
    <div className="stat">
      <div className={`stat-val ${accent || ''}`}>{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}
