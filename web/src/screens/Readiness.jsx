import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { billing as billingApi } from '../api/client.js';
import ScreenTop from '../components/ScreenTop.jsx';

const money = (n) => (n == null ? null : `$${Math.round(n).toLocaleString('en-US')}`);
const PLAN = { steady: ['Steady', '12 months'], focused: ['Focused', '9 months'], express: ['Express', '6 months'] };

// Readiness and recommendation: where you stand today, program by program, the gaps,
// the extra training assigned, and where you could be at 6, 9, 12 months.
export default function Readiness() {
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(null);

  useEffect(() => { billingApi.readiness().then(setD).catch((e) => setError(e.message)); }, []);

  if (error) return <div className="content"><div className="error">{error}</div></div>;
  if (!d) return <div className="loading">Running your numbers…</div>;
  const rec = PLAN[d.recommendedPlan];

  return (
    <div className="content">
      <ScreenTop title="Where you stand" sub={`As of today, from your file. Updated each time your file changes.`} right={<Link className="link" to="/">Plan</Link>} />

      <div className={`card ${d.today.readyNow ? 'gl' : 'hl'}`}>
        <div className="n">{d.today.readyNow ? 'Lender-ready on the basics' : 'Not ready yet'}</div>
        <p className="s" style={{ margin: '4px 0 8px', lineHeight: 1.5 }}>{d.today.headline}</p>
        {d.scoreWithheld && <div className="note">Your score shows here after your first consultation is marked complete.</div>}
        <div className="kv"><span>Estimated price range today</span><span>{d.today.estimatedMaxPrice ? `up to ${money(d.today.estimatedMaxPrice)}` : 'Not yet'}</span></div>
        {d.today.smallestScoreGap > 0 && <div className="kv"><span>Score points to next threshold</span><span>{d.today.smallestScoreGap}</span></div>}
        {d.today.smallestCashGap > 0 && <div className="kv"><span>Cash still to save</span><span>{money(d.today.smallestCashGap)}</span></div>}
        {d.today.documentGaps.length > 0 && <div className="kv"><span>Documents missing</span><span>{d.today.documentGaps.length}</span></div>}
      </div>

      <div className="h2">Programs</div>
      {d.programs.map((p) => (
        <div key={p.code} className={`card ${p.ready ? 'gl' : ''}`}>
          <button type="button" className="row plain" onClick={() => setOpen(open === p.code ? null : p.code)}>
            <div className="grow"><div className="n">{p.name}</div><div className="s">{p.downPct === 0 ? 'No down payment' : `${Math.round(p.downPct * 1000) / 10}% down`}{p.maxPrice ? `, up to ${money(p.maxPrice)}` : ''}</div></div>
            <span className={`pill ${p.ready ? 'g' : p.gaps.some((g) => g.hard) ? 'n' : 'w'}`}>{p.ready ? 'Meets marks' : p.gaps.some((g) => g.hard) ? 'Not eligible' : `${p.gaps.filter((g) => !g.info).length} gap${p.gaps.filter((g) => !g.info).length === 1 ? '' : 's'}`}</span>
          </button>
          {open === p.code && (
            <ul className="plan-feats">
              {p.gaps.length === 0 && <li>Every basic mark met on paper.</li>}
              {p.gaps.map((g) => <li key={g.code}>{g.text}</li>)}
              {p.cashNeeded != null && <li>Cash to close at that price: about {money(p.cashNeeded)}.</li>}
            </ul>
          )}
        </div>
      ))}

      {d.today.documentGaps.length > 0 && (
        <>
          <div className="h2">Documents still needed</div>
          <div className="card list">{d.today.documentGaps.map((x) => <div key={x} className="row"><div className="grow n">{x}</div><Link className="link" to="/prep">Upload</Link></div>)}</div>
        </>
      )}

      {d.training.length > 0 && (
        <>
          <div className="h2">Extra training assigned to you</div>
          <div className="card list">
            {d.training.map((t) => <div key={t.code} className="row"><div className="grow"><div className="n">{t.title}</div><div className="s">Because: {t.reason}</div></div><Link className="link" to="/learn">Open</Link></div>)}
          </div>
        </>
      )}

      <div className="h2">Where you could be</div>
      <div className="card">
        {d.horizons.map((h) => (
          <div key={h.months} className="horizon">
            <div className="row"><div className="grow n">In {h.months} months</div><span className={`pill ${h.programsWithinReach.length ? 'g' : 'n'}`}>{h.programsWithinReach.length ? `${h.programsWithinReach.map((c) => c.toUpperCase()).join(', ')} within reach` : 'Still building'}</span></div>
            <div className="s">{h.scoreRange ? `Score range ${h.scoreRange.low} to ${h.scoreRange.high} if the plan is followed` : 'Score range once your report is on file'}. Savings about {money(h.projectedSavings)} at {money(d.assumptions.monthlySavingsAssumed)} a month.</div>
          </div>
        ))}
        <div className="note" style={{ marginTop: 10 }}>Recommended pace: <b>{rec[0]}</b>, {rec[1]}. <Link to="/plans">See plans</Link></div>
      </div>

      <p className="legal-note">{d.disclaimer} Payment sizing assumes a {Math.round(d.assumptions.rate * 10000) / 100}% 30-year rate for illustration only, not a quote.</p>
    </div>
  );
}
