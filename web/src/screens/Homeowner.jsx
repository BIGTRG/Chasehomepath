import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { home as homeApi } from '../api/client.js';

const usd = (n) => `$${Number(n ?? 0).toLocaleString()}`;

// Homeowner mode (spec §4.16): post-purchase — maintenance, escrow/taxes, value tracking
// (estimate only), refi alerts (informational, defer rate questions to the team).
export default function Homeowner() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [form, setForm] = useState({ address: '', purchasePrice: '', mortgageBalance: '', interestRate: '', monthlyTaxes: '', monthlyInsurance: '' });

  async function load() {
    try { setData(await homeApi.dashboard()); } catch (e) { setError(e.message); }
  }
  useEffect(() => { load(); }, []);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function record(e) {
    e.preventDefault();
    setError(null);
    try {
      await homeApi.record({
        address: form.address || undefined,
        purchasePrice: Number(form.purchasePrice),
        mortgageBalance: form.mortgageBalance ? Number(form.mortgageBalance) : undefined,
        interestRate: form.interestRate ? Number(form.interestRate) / 100 : undefined, // UI is %, API is fraction
        monthlyTaxes: form.monthlyTaxes ? Number(form.monthlyTaxes) : undefined,
        monthlyInsurance: form.monthlyInsurance ? Number(form.monthlyInsurance) : undefined,
      });
      await load();
    } catch (e) { setError(e.message); }
  }

  async function completeTask(id) {
    await homeApi.completeTask(id);
    load();
  }

  if (error) return <div className="content"><div className="error">{error}</div></div>;
  if (!data) return <div className="loading">Loading…</div>;

  if (!data.isHomeowner) {
    return (
      <div className="content">
        <button className="btn secondary back" onClick={() => navigate('/')}>← Plan</button>
        <h1 className="h1">Homeowner mode</h1>
        <p className="sub">Closed on your home? Record it to unlock maintenance, escrow tracking, and more.</p>
        <div className="card">
          <form onSubmit={record}>
            <div className="field"><label>Address</label><input value={form.address} onChange={set('address')} /></div>
            <div className="field"><label>Purchase price</label><input type="number" value={form.purchasePrice} onChange={set('purchasePrice')} required /></div>
            <div className="field"><label>Mortgage balance</label><input type="number" value={form.mortgageBalance} onChange={set('mortgageBalance')} /></div>
            <div className="field"><label>Interest rate (%)</label><input type="number" step="0.01" value={form.interestRate} onChange={set('interestRate')} /></div>
            <div className="field"><label>Monthly taxes</label><input type="number" value={form.monthlyTaxes} onChange={set('monthlyTaxes')} /></div>
            <div className="field"><label>Monthly insurance</label><input type="number" value={form.monthlyInsurance} onChange={set('monthlyInsurance')} /></div>
            <button className="btn" type="submit">Enter homeowner mode</button>
          </form>
        </div>
      </div>
    );
  }

  const { home: h, housing, value, maintenance, refiAlert } = data;

  return (
    <div className="content">
      <button className="btn secondary back" onClick={() => navigate('/')}>← Plan</button>
      <h1 className="h1">Your home</h1>
      <p className="sub">{h.address}</p>

      <div className="card daycount">
        <div className="num" style={{ fontSize: 40 }}>{usd(value.estimated)}</div>
        <div className="label">Estimated value</div>
        {value.equityEstimate != null && <div className="target">Est. equity {usd(value.equityEstimate)}</div>}
        <div className="target" style={{ fontSize: 11, opacity: 0.7 }}>{value.note}</div>
      </div>

      {refiAlert && (
        <div className="rule-banner"><span className="dot" /><span>{refiAlert.message}</span></div>
      )}

      <div className="card money-row">
        <div className="stat"><div className="stat-val">{usd(housing.monthlyTaxes)}</div><div className="stat-label">Taxes/mo</div></div>
        <div className="stat"><div className="stat-val">{usd(housing.monthlyInsurance)}</div><div className="stat-label">Insurance/mo</div></div>
        <div className="stat"><div className="stat-val">{usd(h.mortgageBalance)}</div><div className="stat-label">Balance</div></div>
      </div>

      <div className="h2">Maintenance</div>
      {maintenance.map((t) => (
        <div className="card milestone" key={t.id} style={{ borderTop: 'none' }}>
          <button className={`check ${t.status === 'done' ? 'done' : ''}`} onClick={() => completeTask(t.id)} aria-label="Mark done">
            {t.status === 'done' ? '✓' : ''}
          </button>
          <span className="ms-label">{t.label}</span>
          {t.due_date && <span className="ms-day">due {new Date(t.due_date).toLocaleDateString()}</span>}
        </div>
      ))}
    </div>
  );
}
