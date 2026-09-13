import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { money as moneyApi, billing as billingApi } from '../api/client.js';
import ScreenTop from '../components/ScreenTop.jsx';
import { COUNSELOR } from '../brand.js';

const usd = (n) => `$${Number(n ?? 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

// Step 7: bank first, then a budget proposed from the member's own transactions.
// The member edits every line and approves. The remainder is the "to your home" line,
// wired to the down-payment goal the readiness engine sized.
export default function BudgetSetup() {
  const navigate = useNavigate();
  const [p, setP] = useState(null);
  const [lines, setLines] = useState([]);
  const [income, setIncome] = useState(0);
  const [downTarget, setDownTarget] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [newCat, setNewCat] = useState('');

  async function load() {
    try {
      const prop = await moneyApi.budgetProposal();
      setP(prop); setLines(prop.lines); setIncome(prop.monthlyIncome);
      try {
        const r = await billingApi.readiness();
        const best = (r.programs || []).map((x) => x.cashNeeded).filter(Boolean).sort((a, b) => a - b)[0];
        if (best) setDownTarget(Math.round(best));
      } catch { /* readiness optional here */ }
    } catch (e) { setError(e.message); }
  }
  useEffect(() => { load(); }, []);

  async function linkBank() {
    setBusy(true); setError(null);
    try { await moneyApi.link('public-mock-token'); await moneyApi.sync(); await load(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  function setLine(i, v) { setLines(lines.map((l, j) => (j === i ? { ...l, monthlyTarget: Math.max(0, Number(v) || 0) } : l))); }
  function addLine() {
    const c = newCat.trim().toLowerCase().replace(/\s+/g, '_');
    if (!c || lines.some((l) => l.category === c)) return;
    setLines([...lines, { category: c, label: newCat.trim(), actual: 0, monthlyTarget: 0 }]); setNewCat('');
  }
  async function save() {
    setBusy(true); setError(null);
    try {
      await moneyApi.budgetSetup({ lines: lines.map((l) => ({ category: l.category, monthlyTarget: l.monthlyTarget })), toHome, downPaymentTarget: downTarget ?? undefined });
      navigate('/money');
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  if (error && !p) return <div className="content"><div className="error">{error}</div></div>;
  if (!p) return <div className="loading">Loading…</div>;

  const spend = lines.reduce((a, l) => a + Number(l.monthlyTarget || 0), 0);
  const toHome = Math.max(0, income - spend);
  const monthsToGoal = downTarget && toHome > 0 ? Math.ceil(downTarget / toHome) : null;

  return (
    <div className="content">
      <ScreenTop title="Your budget" sub="Step 7 of 7" right={<Link to="/money" className="link-orange">Skip</Link>} />

      {!p.linked ? (
        <div className="card hl">
          <div className="n">1. Link your bank</div>
          <p className="s" style={{ lineHeight: 1.5 }}>Your budget is built from what you actually spend, not a guess. The connection is read-only and encrypted; we never move money and never sell your data. {COUNSELOR.name} uses it to coach you on real numbers.</p>
          <button type="button" className="btn" disabled={busy} onClick={linkBank}>{busy ? 'Linking…' : 'Link my bank'}</button>
        </div>
      ) : (
        <div className="card gl"><div className="n">Bank linked</div><div className="s">{p.institutions.join(', ')} · read-only · synced today</div></div>
      )}

      <div className="card">
        <div className="n">2. Monthly take-home</div>
        <div className="s" style={{ marginBottom: 6 }}>{p.incomeSource === 'bank' ? 'From deposits in your account.' : p.incomeSource === 'stated' ? 'Estimated from the income you entered. Change it to your real take-home.' : 'Enter what lands in your account each month.'}</div>
        <input className="input" type="number" inputMode="decimal" value={income} onChange={(e) => setIncome(Math.max(0, Number(e.target.value) || 0))} />
      </div>

      <div className="card">
        <div className="n">3. Your spending lines</div>
        <p className="s" style={{ lineHeight: 1.5, marginTop: 4 }}>{p.note}</p>
        {lines.map((l, i) => (
          <div key={l.category} className="brow" style={{ alignItems: 'center', padding: '8px 0', borderTop: '1px solid #eee' }}>
            <div style={{ flex: 1 }}>
              <div className="bl">{l.label}</div>
              {l.actual > 0 && <div className="s">Actual {usd(l.actual)}/mo{l.trimmed ? ' · trimmed' : ''}</div>}
            </div>
            <input className="input" style={{ width: 96, textAlign: 'right' }} type="number" inputMode="decimal" value={l.monthlyTarget} onChange={(e) => setLine(i, e.target.value)} aria-label={`${l.label} monthly target`} />
          </div>
        ))}
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <input className="input" placeholder="Add a line, e.g. Childcare" value={newCat} onChange={(e) => setNewCat(e.target.value)} />
          <button type="button" className="btn ghost" onClick={addLine} style={{ whiteSpace: 'nowrap' }}>Add</button>
        </div>
      </div>

      <div className={`card ${toHome > 0 ? 'gl' : 'hl'}`}>
        <div className="brow"><span className="bl">To your home each month</span><span className="bv" style={{ fontSize: 20, fontWeight: 800 }}>{usd(toHome)}</span></div>
        <div className="s" style={{ marginTop: 4 }}>{usd(income)} in, {usd(spend)} planned out.</div>
        {downTarget && (
          <div className="s" style={{ marginTop: 6 }}>
            Down payment and closing target: {usd(downTarget)}.{monthsToGoal ? ` At this pace, about ${monthsToGoal} months.` : ' Free up something above to start the clock.'}
          </div>
        )}
      </div>

      {error && <div className="error">{error}</div>}
      <button type="button" className="btn" disabled={busy || lines.length === 0} onClick={save}>{busy ? 'Saving…' : 'Approve my budget'}</button>
      <p className="s" style={{ textAlign: 'center', marginTop: 8 }}>Change any line any time from Money. {COUNSELOR.name} checks it against your bank every month.</p>
    </div>
  );
}
