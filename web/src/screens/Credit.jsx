import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { credit as creditApi } from '../api/client.js';
import ScreenTop from '../components/ScreenTop.jsx';

// Walkthrough screen 7: items split into "Look inaccurate" vs "Accurate". The accurate
// ones get honest advice, not filler disputes. Score withheld until first meeting. (§4.8, §8)
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
        <ScreenTop title="Your credit" sub="You're in control" />
        <div className="card">
          <p style={{ marginTop: 0, fontSize: 14, lineHeight: 1.55 }}>
            When you're ready and have authorized the pull, we'll bring in your report and
            walk each item with you.
          </p>
          <button className="btn" onClick={pull} disabled={busy}>
            {busy ? 'Pulling…' : 'Pull my report'}
          </button>
        </div>
      </div>
    );
  }

  const total = data.disputable.length + data.accurate.length;

  return (
    <div className="content">
      <ScreenTop
        title="Your credit"
        sub="You're in control"
        right={<Link to="/agent" className="top-ic" aria-label="Ask the HomePath agent">💬</Link>}
      />

      <div className="note">
        We reviewed all {total} item{total === 1 ? '' : 's'}. {data.disputable.length} look
        inaccurate — you can dispute those. The other {data.accurate.length} are accurate;
        we'll work those a smarter way.
      </div>

      {/* Score is withheld until the first consultation (spec §8). */}
      {!data.score.withheld && (
        <div className="card score-card">
          <div className="score-num">{data.score.value ?? '—'}</div>
          <div className="score-note">Reviewed with your specialist.</div>
        </div>
      )}

      <div className="lbl">Look inaccurate — {data.disputable.length}</div>
      {data.disputable.length === 0 && <div className="card muted-card">Nothing here right now.</div>}
      {data.disputable.map((it) => (
        <Link key={it.id} to={`/credit/items/${it.id}`} className="card hl item-card">
          <div className="item-top">
            <span className="item-creditor">{it.creditor}</span>
            <span className="chev">›</span>
          </div>
          <div className="item-meta">{it.guidance_text}</div>
          {it.has_open_dispute && <span className="badge open" style={{ marginTop: 8, display: 'inline-block' }}>Dispute open</span>}
        </Link>
      ))}

      <div className="lbl">Accurate — {data.accurate.length}</div>
      {data.accurate.length === 0 && <div className="card muted-card">Nothing here right now.</div>}
      {data.accurate.length > 0 && (
        <div className="card">
          <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55 }}>
            These report correctly. Disputing won't help — but paying down your highest
            cards moves your score the most.
          </p>
          <Link to="/money" className="link-orange" style={{ display: 'inline-block', marginTop: 10 }}>
            See your paydown plan ›
          </Link>
        </div>
      )}
      {data.accurate.map((it) => (
        <Link key={it.id} to={`/credit/items/${it.id}`} className="card item-card">
          <div className="item-top">
            <span className="item-creditor">{it.creditor}</span>
            <span className="chev">›</span>
          </div>
          <div className="item-meta">{it.type} · ${Number(it.balance ?? 0).toLocaleString()}</div>
        </Link>
      ))}
    </div>
  );
}
