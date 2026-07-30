import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { home as homeApi } from '../api/client.js';
import ScreenTop from '../components/ScreenTop.jsx';

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
      <div className="content ctr">
        <div className="big-emoji" aria-hidden>🏠</div>
        <h1 className="h1">You're a homeowner</h1>
        <p className="p">
          You started on day one not sure it was possible. Look what you did. Record your
          closing below and keep going with HomePath — maintenance, taxes, value tracking,
          refinance alerts.
        </p>
        <div className="card" style={{ textAlign: 'left' }}>
          <form onSubmit={record}>
            <div className="field"><label>Address</label><input value={form.address} onChange={set('address')} /></div>
            <div className="field"><label>Purchase price</label><input type="number" value={form.purchasePrice} onChange={set('purchasePrice')} required /></div>
            <div className="field"><label>Mortgage balance</label><input type="number" value={form.mortgageBalance} onChange={set('mortgageBalance')} /></div>
            <div className="field"><label>Interest rate (%)</label><input type="number" step="0.01" value={form.interestRate} onChange={set('interestRate')} /></div>
            <div className="field"><label>Monthly taxes</label><input type="number" value={form.monthlyTaxes} onChange={set('monthlyTaxes')} /></div>
            <div className="field"><label>Monthly insurance</label><input type="number" value={form.monthlyInsurance} onChange={set('monthlyInsurance')} /></div>
            <button className="btn" type="submit">Enter homeowner mode</button>
            <button className="btn secondary" type="button" onClick={() => navigate('/')}>← Back to your plan</button>
          </form>
        </div>
      </div>
    );
  }

  const { home: h, housing, value, maintenance, refiAlert } = data;

  return (
    <div className="content">
      <button className="btn secondary back" onClick={() => navigate('/')}>← Plan</button>
      <ScreenTop title="Your home" sub={h.address} />

      <div className="mrow">
        <div className="m"><div className="ml">Estimated value</div><div className="mv g">{usd(value.estimated)}</div></div>
        <div className="m"><div className="ml">Est. equity</div><div className="mv">{value.equityEstimate != null ? usd(value.equityEstimate) : '—'}</div></div>
      </div>
      <div className="gy">{value.note}</div>

      {refiAlert && <div className="note">{refiAlert.message}</div>}

      <div className="mrow" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
        <div className="m"><div className="ml">Taxes/mo</div><div className="mv" style={{ fontSize: 17 }}>{usd(housing.monthlyTaxes)}</div></div>
        <div className="m"><div className="ml">Insurance/mo</div><div className="mv" style={{ fontSize: 17 }}>{usd(housing.monthlyInsurance)}</div></div>
        <div className="m"><div className="ml">Balance</div><div className="mv" style={{ fontSize: 17 }}>{usd(h.mortgageBalance)}</div></div>
      </div>

      <div className="lbl">Maintenance</div>
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
