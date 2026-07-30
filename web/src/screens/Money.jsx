import { useEffect, useState } from 'react';
import { money as moneyApi, credit as creditApi } from '../api/client.js';
import ScreenTop from '../components/ScreenTop.jsx';

const usd = (n) => `$${Number(n ?? 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

// Walkthrough screen 10: Plaid-linked, so coaching is specific. Spent/Saved metrics,
// budget bars, orange coaching note, disputes tracked below. (spec §4.11)
export default function Money() {
  const [data, setData] = useState(null);
  const [disputes, setDisputes] = useState([]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      setData(await moneyApi.overview());
      const d = await creditApi.disputes();
      setDisputes(d.disputes);
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

  const savedToHome = data.savings?.reduce((s, g) => s + Number(g.current_amount || 0), 0) ?? 0;
  const openDisputes = disputes.filter((d) => ['draft', 'filed', 'investigating'].includes(d.status));
  const doneDisputes = disputes.filter((d) => ['resolved'].includes(d.status));

  return (
    <div className="content">
      <ScreenTop
        title="Your money"
        right={data.linked ? <span className="pill g">Bank linked</span> : <span className="pill n">Not linked</span>}
      />

      {!data.linked ? (
        <div className="card">
          <p style={{ marginTop: 0, fontSize: 14, lineHeight: 1.55 }}>
            Link your bank to see spending, set budgets, and get specific coaching. Your
            connection is encrypted and your data is never sold.
          </p>
          <button className="btn" onClick={linkAndSync} disabled={busy}>
            {busy ? 'Linking…' : 'Link my bank'}
          </button>
        </div>
      ) : (
        <>
          <div className="mrow">
            <div className="m">
              <div className="ml">Spent</div>
              <div className="mv">{usd(data.month.spend)}</div>
            </div>
            <div className="m">
              <div className="ml">Saved to home</div>
              <div className="mv g">{usd(savedToHome)}</div>
            </div>
          </div>

          {data.budgets.length > 0 && (
            <div className="card">
              {data.budgets.map((b) => {
                const pct = Math.min(100, Math.round((b.actual / Math.max(1, b.monthly_target)) * 100));
                const over = b.actual > b.monthly_target;
                return (
                  <div key={b.id} style={{ marginBottom: 12 }}>
                    <div className="brow">
                      <span className="bl">{b.category}</span>
                      <span className={`bv ${over ? 'over' : ''}`}>
                        {usd(b.actual)}{over ? ' · over' : ''}
                      </span>
                    </div>
                    <div className="bar"><span className={over ? 'w' : 'b'} style={{ width: `${pct}%` }} /></div>
                  </div>
                );
              })}
            </div>
          )}

          {data.coaching.map((c, i) => (
            <div className="note" key={i}>{c.message}</div>
          ))}

          {data.savings.length > 0 && (
            <>
              <div className="lbl">Savings goals</div>
              {data.savings.map((g) => {
                const pct = Math.min(100, Math.round((g.current_amount / Math.max(1, g.target_amount)) * 100));
                return (
                  <div className="card" key={g.id}>
                    <div className="brow">
                      <span className="bl">{g.label}</span>
                      <span className="bv">{usd(g.current_amount)} of {usd(g.target_amount)}</span>
                    </div>
                    <div className="bar"><span className="b" style={{ width: `${pct}%` }} /></div>
                  </div>
                );
              })}
            </>
          )}
        </>
      )}

      <div className="lbl">Disputes in progress</div>
      {disputes.length === 0 && <div className="card muted-card">No disputes yet. You start them from a credit item.</div>}
      {openDisputes.map((d) => (
        <div className="card" key={d.id}>
          <div className="item-top">
            <div>
              <div className="item-creditor">{d.creditor}</div>
              <div className="item-meta">Day {d.day_count} of 30</div>
            </div>
            <span className="pill o">Open</span>
          </div>
        </div>
      ))}
      {doneDisputes.map((d) => (
        <div className="card gl" key={d.id}>
          <div className="item-top">
            <div>
              <div className="item-creditor">{d.creditor}</div>
              <div className="item-meta">Resolved</div>
            </div>
            <span className="pill g">Done</span>
          </div>
        </div>
      ))}
    </div>
  );
}
