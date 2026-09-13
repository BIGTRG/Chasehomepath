import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { credit as creditApi, billing as billingApi } from '../api/client.js';
import ScreenTop from '../components/ScreenTop.jsx';
import { COUNSELOR } from '../brand.js';

const fmt = (d) => new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

/** Simple SVG line: history points plus dotted target band at 6/9/12 months. */
export function ScoreChart({ points, horizons = [], height = 150 }) {
  const w = 340; const padL = 34; const padR = 10; const padT = 12; const padB = 22;
  const all = [...points.map((p) => p.score), ...horizons.flatMap((h) => (h.scoreRange ? [h.scoreRange.low, h.scoreRange.high] : []))];
  if (points.length === 0) return null;
  const lo = Math.max(300, Math.floor((Math.min(...all) - 20) / 20) * 20);
  const hi = Math.min(850, Math.ceil((Math.max(...all) + 20) / 20) * 20);
  const n = points.length + horizons.length;
  const x = (i) => padL + (i * (w - padL - padR)) / Math.max(1, n - 1);
  const y = (s) => padT + ((hi - s) * (height - padT - padB)) / Math.max(1, hi - lo);
  const line = points.map((p, i) => `${x(i)},${y(p.score)}`).join(' ');
  const lastI = points.length - 1;
  return (
    <svg viewBox={`0 0 ${w} ${height}`} width="100%" role="img" aria-label="Score over time">
      {[lo, Math.round((lo + hi) / 2), hi].map((g) => (
        <g key={g}><line x1={padL} x2={w - padR} y1={y(g)} y2={y(g)} stroke="#e8e3db" /><text x={2} y={y(g) + 4} fontSize="10" fill="#8a8479">{g}</text></g>
      ))}
      {horizons.map((h, i) => h.scoreRange && (
        <g key={h.months}>
          <rect x={x(lastI + i + 1) - 9} width={18} y={y(h.scoreRange.high)} height={Math.max(2, y(h.scoreRange.low) - y(h.scoreRange.high))} fill="#e9891b" opacity="0.22" rx="3" />
          <text x={x(lastI + i + 1)} y={height - 6} fontSize="10" textAnchor="middle" fill="#8a8479">{h.months} mo</text>
        </g>
      ))}
      <polyline points={line} fill="none" stroke="#1f2a44" strokeWidth="2.5" strokeLinejoin="round" />
      {points.map((p, i) => (
        <g key={p.date}>
          <circle cx={x(i)} cy={y(p.score)} r={i === lastI ? 5 : 3.5} fill={i === lastI ? '#e9891b' : '#1f2a44'} />
          {(i === 0 || i === lastI) && <text x={x(i)} y={height - 6} fontSize="10" textAnchor="middle" fill="#8a8479">{fmt(p.date)}</text>}
        </g>
      ))}
    </svg>
  );
}

// Credit monitoring display: every reading over time, the three bureaus, the 6/9/12
// targets from the readiness engine, and a way to log this month's SmartCredit scores
// until the partner feed is live.
export default function ScoreTrend() {
  const [h, setH] = useState(null);
  const [r, setR] = useState(null);
  const [form, setForm] = useState({ experian: '', equifax: '', transunion: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  async function load() {
    try { setH(await creditApi.scores()); } catch (e) { setError(e.message); }
    try { setR(await billingApi.readiness()); } catch { /* optional */ }
  }
  useEffect(() => { load(); }, []);

  async function log() {
    setBusy(true); setError(null); setSaved(false);
    const body = Object.fromEntries(Object.entries(form).filter(([, v]) => v !== '').map(([k, v]) => [k, Number(v)]));
    try { setH(await creditApi.recordScores(body)); setForm({ experian: '', equifax: '', transunion: '' }); setSaved(true); } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  if (error && !h) return <div className="content"><div className="error">{error}</div></div>;
  if (!h) return <div className="loading">Loading…</div>;

  if (h.withheld) {
    return (
      <div className="content">
        <ScreenTop title="Your score over time" sub="Monitoring" />
        <div className="card hl"><div className="n">Unlocks after your first meeting</div><div className="s">{COUNSELOR.name} explains your score in the room first, so you see it with context, not as a bare number.</div></div>
        <Link to="/start" className="btn">Back to your first day</Link>
      </div>
    );
  }

  const up = h.change > 0; const flat = h.change === 0;
  return (
    <div className="content">
      <ScreenTop title="Your score over time" sub={h.monitoring ? 'Monitored with SmartCredit' : 'Monitoring'} />

      <div className="card score-card" style={{ textAlign: 'left' }}>
        <div className="brow" style={{ alignItems: 'flex-end' }}>
          <div>
            <div className="ml">Today</div>
            <div className="score-num" style={{ fontSize: 44, lineHeight: 1 }}>{h.latest ?? '—'}</div>
          </div>
          {h.start != null && h.points.length > 1 && (
            <span className={`pill ${up ? 'g' : flat ? 'n' : 'w'}`} style={{ fontSize: 14 }}>{up ? '+' : ''}{h.change} since {fmt(h.since)}</span>
          )}
        </div>
        <ScoreChart points={h.points} horizons={r?.horizons ?? []} />
        <div className="s">Line is your readings. Orange bands are the ranges your plan is working toward at 6, 9, and 12 months. Ranges are not promises; they come from the levers in your plan.</div>
      </div>

      <div className="lbl">By bureau</div>
      <div className="mrow" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
        {h.bureaus.map((b) => (
          <div className="m" key={b.bureau}>
            <div className="ml" style={{ textTransform: 'capitalize' }}>{b.bureau}</div>
            <div className="mv">{b.score ?? '—'}</div>
            {b.date && <div className="s">{fmt(b.date)}</div>}
          </div>
        ))}
      </div>

      {r?.horizons && (
        <div className="card">
          <div className="n">Where you could be</div>
          {r.horizons.map((x) => x.scoreRange && (
            <div className="brow" key={x.months} style={{ padding: '6px 0' }}>
              <span className="bl">{x.months} months</span>
              <span className="bv">{x.scoreRange.low} to {x.scoreRange.high}{x.programsWithinReach?.length ? ` · ${x.programsWithinReach.map((c) => c.toUpperCase()).join(', ')} in reach` : ''}</span>
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <div className="n">Log this month's SmartCredit scores</div>
        <p className="s" style={{ lineHeight: 1.5, marginTop: 4 }}>Open SmartCredit, read the three scores, enter them here. {h.nextCheck ? `Next check ${fmt(h.nextCheck)}.` : ''} When the SmartCredit feed is connected these fill in on their own.</p>
        <div className="mrow" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
          {['experian', 'equifax', 'transunion'].map((b) => (
            <input key={b} className="input" type="number" inputMode="numeric" min="300" max="850" placeholder={b[0].toUpperCase() + b.slice(1)} aria-label={b} value={form[b]} onChange={(e) => setForm({ ...form, [b]: e.target.value })} />
          ))}
        </div>
        {error && <div className="error">{error}</div>}
        {saved && <div className="note">Saved. Your line is updated.</div>}
        <button type="button" className="btn" disabled={busy} onClick={log} style={{ marginTop: 10 }}>{busy ? 'Saving…' : 'Save scores'}</button>
        <a className="center-link" href="https://www.smartcredit.com/login" target="_blank" rel="noopener">Open SmartCredit</a>
      </div>

      <div className="card muted-card s">Your score changes for reasons in your file: balances, on-time months, items you questioned. {COUNSELOR.name} can walk you through any move. Nothing here is a guarantee of a score or a loan.</div>
    </div>
  );
}
