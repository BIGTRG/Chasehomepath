import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { billing as billingApi } from '../../api/client.js';
import ScreenTop from '../../components/ScreenTop.jsx';
import { money } from './Plans.jsx';

const fmt = (d) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const fmtWhen = (d) => new Date(d).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

// Member billing: plan, one-tap cancel, sessions, payment history.
export default function Billing() {
  const { state } = useLocation();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = () => billingApi.me().then(setData).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  if (error) return <div className="content"><div className="error">{error}</div></div>;
  if (!data) return <div className="loading">Loading…</div>;
  const sub = data.subscription;

  async function act(fn) {
    setBusy(true);
    setError(null);
    try { await fn(); await load(); } catch (e) { setError(e.message); } finally { setBusy(false); setConfirm(false); }
  }

  return (
    <div className="content">
      <ScreenTop title="Billing" sub="Your plan, sessions, and receipts" />
      {state?.justSubscribed && <div className="note">You are in. Your plan is active and your receipt is on its way by email.</div>}

      {!sub ? (
        <div className="card">
          <div className="n">No plan yet</div>
          <div className="s" style={{ margin: '4px 0 10px' }}>Pick a pace to unlock your full HomePath plan.</div>
          <Link className="btn" to="/plans">See plans</Link>
        </div>
      ) : (
        <div className={`card ${sub.status === 'past_due' ? 'warn' : 'hl'}`}>
          <div className="row">
            <div className="grow"><div className="n">{sub.planName} plan</div><div className="s">{sub.targetMonths}-month target</div></div>
            <div className="plan-price">{money(sub.priceCents)}<small>/mo</small></div>
          </div>
          <div className="kv"><span>Payment method</span><span>{sub.paymentMethod || 'Card on file'}</span></div>
          <div className="kv"><span>Member since</span><span>{fmt(sub.startedAt)}</span></div>
          {sub.status === 'past_due' && <div className="error">Your last payment did not go through. Update your card to keep your plan active.</div>}
          {sub.cancelAtPeriodEnd ? (
            <>
              <div className="kv"><span>Plan ends</span><span>{fmt(sub.currentPeriodEnd)}</span></div>
              <button type="button" className="btn outline" disabled={busy} onClick={() => act(billingApi.resume)}>Keep my plan</button>
            </>
          ) : (
            <>
              <div className="kv"><span>Next charge</span><span>{fmt(sub.currentPeriodEnd)}</span></div>
              <Link className="btn outline" to="/plans">Change plan</Link>
              {!confirm ? (
                <button type="button" className="btn secondary" onClick={() => setConfirm(true)}>Cancel plan</button>
              ) : (
                <div className="card soft">
                  <div className="s">Cancel now and you keep access until {fmt(sub.currentPeriodEnd)}. No further charges. You can come back anytime.</div>
                  <button type="button" className="btn danger" disabled={busy} onClick={() => act(billingApi.cancel)}>Yes, cancel my plan</button>
                  <button type="button" className="btn secondary" onClick={() => setConfirm(false)}>Never mind</button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      <div className="h2 row"><span className="grow">1:1 counseling</span><Link className="link" to="/sessions/book">Book a session</Link></div>
      <div className="card muted-card">{data.session.durationMin} minutes with your specialist, {money(data.session.priceCents)} per session. Independent of your plan; book as often as your plan calls for. Full refund if cancelled 24 hours ahead.</div>
      {data.sessions.length > 0 && (
        <div className="card list">
          {data.sessions.map((s) => (
            <div key={s.id} className="row">
              <div className="grow">
                <div className="n">{fmtWhen(s.scheduledAt)}</div>
                <div className="s">{s.type === 'in_person' ? 'In person' : s.type === 'video' ? 'Video' : 'Phone'}{s.topic ? `, ${s.topic}` : ''}</div>
              </div>
              <span className={`badge status-${s.status === 'booked' ? 'scheduled' : s.status}`}>{s.status}</span>
              {s.status === 'booked' && (
                <button type="button" className="btn small secondary" disabled={busy} onClick={() => act(() => billingApi.cancelSession(s.id))}>Cancel</button>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="h2">Receipts</div>
      {data.payments.length === 0 ? <div className="card muted-card">No payments yet.</div> : (
        <div className="card list">
          {data.payments.map((p) => (
            <div key={p.id} className="row">
              <div className="grow"><div className="n">{p.description}</div><div className="s">{fmt(p.createdAt)}</div></div>
              <div className={`amt ${p.status}`}>{p.status === 'refunded' ? '-' : ''}{money(p.amountCents)}</div>
              <span className={`badge status-${p.status === 'succeeded' ? 'completed' : p.status === 'failed' ? 'withdrawn' : 'scheduled'}`}>{p.status}</span>
            </div>
          ))}
        </div>
      )}

      <p className="legal-note">CHASE HomePath is homeownership education and planning, not credit repair. Questions about a charge: support@chasehomepath.com.</p>
    </div>
  );
}
