import { useEffect, useState } from 'react';
import { billing as billingApi } from '../../api/client.js';

const money = (c) => `$${(c / 100).toLocaleString('en-US', { minimumFractionDigits: c % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;

// Operator billing view: MRR, plan mix, revenue, sessions, recent payments, schedule a group session.
export default function BillingDash() {
  const [s, setS] = useState(null);
  const [error, setError] = useState(null);
  const [cat, setCat] = useState(null);
  const [form, setForm] = useState({ topicCode: 'budget_101', scheduledAt: '', capacity: 12, priceCents: '' });
  const [msg, setMsg] = useState(null);

  const load = () => billingApi.operatorSummary().then(setS).catch((e) => setError(e.message));
  useEffect(() => { load(); billingApi.counseling().then(setCat).catch(() => {}); }, []);

  if (error) return <div className="error">{error}</div>;
  if (!s) return <div className="loading">Loading…</div>;

  async function createGroup(e) {
    e.preventDefault();
    setMsg(null);
    try {
      const body = { topicCode: form.topicCode, scheduledAt: new Date(form.scheduledAt).toISOString(), capacity: Number(form.capacity) };
      if (form.priceCents !== '') body.priceCents = Math.round(Number(form.priceCents) * 100);
      const { groupSession } = await billingApi.createGroup(body);
      setMsg(`Scheduled: ${groupSession.title}, ${new Date(groupSession.scheduledAt).toLocaleString('en-US')}`);
      setCat(await billingApi.counseling());
    } catch (err) { setMsg(err.message); }
  }

  return (
    <div>
      <h1 className="h1">Billing</h1>
      <p className="sub">Processor: {s.processor}{s.processor === 'mock' ? ' (test mode, no real charges)' : ''}</p>

      <div className="op-kpis">
        <div className="kpi"><div className="k">Monthly recurring</div><div className="v">{money(s.mrrCents)}</div></div>
        <div className="kpi"><div className="k">Collected this month</div><div className="v">{money(s.revenue.monthCents)}</div></div>
        <div className="kpi"><div className="k">Lifetime</div><div className="v">{money(s.revenue.lifetimeCents)}</div></div>
        <div className="kpi"><div className="k">Failed, 30 days</div><div className={`v ${s.revenue.failed30d ? 'bad' : ''}`}>{s.revenue.failed30d}</div></div>
        <div className="kpi"><div className="k">Sessions upcoming</div><div className="v">{s.sessions.upcoming}</div></div>
      </div>

      <div className="h2">Plans</div>
      <table className="op-table">
        <thead><tr><th>Plan</th><th>Price</th><th>Active</th><th>Cancelling</th><th>Past due</th><th>MRR</th></tr></thead>
        <tbody>
          {s.plans.map((p) => (
            <tr key={p.code}><td>{p.name}</td><td>{money(p.priceCents)}/mo</td><td>{p.active}</td><td>{p.cancelling}</td><td>{p.pastDue ? <span className="hbadge red">{p.pastDue}</span> : 0}</td><td>{money(p.priceCents * p.active)}</td></tr>
          ))}
        </tbody>
      </table>

      <div className="op-grid">
        <section className="card">
          <div className="h2" style={{ marginTop: 0 }}>Schedule a group session</div>
          <form onSubmit={createGroup} className="op-form">
            <label>Topic
              <select value={form.topicCode} onChange={(e) => setForm({ ...form, topicCode: e.target.value })}>
                {(cat?.topics || []).map((t) => <option key={t.code} value={t.code}>{t.name}</option>)}
              </select>
            </label>
            <label>When<input type="datetime-local" required value={form.scheduledAt} onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })} /></label>
            <div className="op-form-row">
              <label>Seats<input type="number" min="2" max="200" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} /></label>
              <label>Price (USD)<input type="number" min="0" step="1" placeholder={cat ? (cat.group.priceCents / 100).toString() : ''} value={form.priceCents} onChange={(e) => setForm({ ...form, priceCents: e.target.value })} /></label>
            </div>
            <button className="btn small" type="submit">Schedule</button>
            {msg && <div className="tsub" style={{ marginTop: 8 }}>{msg}</div>}
            {cat?.group?.placeholder && <div className="tsub">Default group price {money(cat.group.priceCents)} is a placeholder until HQ sets it.</div>}
          </form>
          {cat?.groupSessions?.length > 0 && (
            <>
              <div className="h2">Upcoming</div>
              {cat.groupSessions.map((g) => (
                <div key={g.id} className="kv"><span>{new Date(g.scheduledAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}, {g.title}</span><span>{g.seatsTaken}/{g.capacity} <a className="link" href={`/meet/${g.roomCode}`}>Room</a></span></div>
              ))}
            </>
          )}
        </section>

        <section className="card">
          <div className="h2" style={{ marginTop: 0 }}>Recent payments</div>
          <table className="op-table">
            <thead><tr><th>Member</th><th>What</th><th>Amount</th><th>Status</th><th>Date</th></tr></thead>
            <tbody>
              {s.recent.map((p) => (
                <tr key={p.id}><td>{p.email}</td><td>{p.description}</td><td>{money(p.amountCents)}</td><td><span className={`hbadge ${p.status === 'succeeded' ? 'green' : p.status === 'failed' ? 'red' : 'amber'}`}>{p.status}</span></td><td>{new Date(p.createdAt).toLocaleDateString('en-US')}</td></tr>
              ))}
              {s.recent.length === 0 && <tr><td colSpan="5" className="muted-card">No payments yet.</td></tr>}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}
