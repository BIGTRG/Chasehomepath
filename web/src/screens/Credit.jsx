import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { credit as creditApi } from '../api/client.js';

// Credit screen (spec §4.8): items split disputable vs accurate. Accurate items get
// honest guidance, never filler disputes. Score is withheld until the first meeting.
export default function Credit() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      setData(await creditApi.overview());
    } catch (err) {
      setError(err.message);
    }
  }
  useEffect(() => { load(); }, []);

  async function pull() {
    setBusy(true);
    setError(null);
    try {
      await creditApi.pull();
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (error) return <div className="content"><div className="error">{error}</div></div>;
  if (!data) return <div className="loading">Loading…</div>;

  if (!data.hasReport) {
    return (
      <div className="content">
        <h1 className="h1">Credit</h1>
        <p className="sub">You do your own credit work here — the app guides, you act.</p>
        <div className="card">
          <p style={{ marginTop: 0 }}>
            When you're ready and have authorized the pull, we'll bring in your report and the
            engine will walk each item with you.
          </p>
          <button className="btn" onClick={pull} disabled={busy}>
            {busy ? 'Pulling…' : 'Pull my report'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="content">
      <h1 className="h1">Credit</h1>

      {/* Score is withheld until the first consultation (spec §8). */}
      <div className="card score-card">
        {data.score.withheld ? (
          <>
            <div className="score-hidden">•••</div>
            <div className="score-note">
              Your score is reserved for your first consultation. We'll review it together —
              day count leads here, not a number.
            </div>
          </>
        ) : (
          <>
            <div className="score-num">{data.score.value ?? '—'}</div>
            <div className="score-note">Reviewed with your specialist.</div>
          </>
        )}
      </div>

      <Section
        title="Worth a closer look"
        subtitle="These items may be disputable. You decide whether to act — nothing is filed for you."
        items={data.disputable}
        badge="disputable"
      />
      <Section
        title="Reporting accurately"
        subtitle="These look accurate. Honest guidance below — no filler disputes."
        items={data.accurate}
        badge="accurate"
      />
    </div>
  );
}

function Section({ title, subtitle, items, badge }) {
  return (
    <>
      <div className="h2">{title}</div>
      <p className="sub" style={{ marginTop: -6 }}>{subtitle}</p>
      {items.length === 0 && <div className="card muted-card">Nothing here right now.</div>}
      {items.map((it) => (
        <Link key={it.id} to={`/credit/items/${it.id}`} className="card item-card">
          <div className="item-top">
            <span className="item-creditor">{it.creditor}</span>
            <span className={`badge ${badge}`}>{badge}</span>
          </div>
          <div className="item-meta">
            {it.type} · ${Number(it.balance ?? 0).toLocaleString()}
            {it.has_open_dispute && <span className="badge open"> dispute open</span>}
          </div>
          <div className="item-guidance">{it.guidance_text}</div>
        </Link>
      ))}
    </>
  );
}
