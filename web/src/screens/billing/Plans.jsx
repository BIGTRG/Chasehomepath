import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { billing as billingApi } from '../../api/client.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import ScreenTop from '../../components/ScreenTop.jsx';

export const money = (c) => `$${(c / 100).toFixed(c % 100 ? 2 : 0)}`;

// Pricing screen (Deon picked option A, 2026-09-12): three plan cards, monthly, timeline-first.
// Counseling is an independent $89 add-on on every tier. Nothing bundled.
export default function Plans() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [current, setCurrent] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    billingApi.plans().then(setData).catch((e) => setError(e.message));
    if (user) billingApi.me().then((d) => setCurrent(d.subscription)).catch(() => {});
  }, [user]);

  if (error) return <div className="content"><div className="error">{error}</div></div>;
  if (!data) return <div className="loading">Loading…</div>;

  const highlighted = data.plans.find((p) => p.highlight) ?? data.plans[0];

  function choose(p) {
    if (!user) return navigate('/register', { state: { planCode: p.code } });
    const meeting = new URLSearchParams(window.location.search).get('meeting');
    navigate(`/checkout/${p.code}${meeting ? `?meeting=${meeting}` : ''}`);
  }

  return (
    <div className="content">
      <ScreenTop title="Choose your pace" sub="Same plan, same tools. You pick how fast you want the keys. Cancel anytime." />

      {current && (
        <div className="note">You are on the <b>{current.planName}</b> plan. Pick another card to switch, or <Link to="/billing">manage billing</Link>.</div>
      )}

      {data.plans.map((p) => (
        <div key={p.code} className={`card plan-card ${p.highlight ? 'hl' : ''}`}>
          {p.highlight && <span className="plan-tag">FASTEST PATH</span>}
          <div className="row">
            <div className="grow">
              <div className="n">{p.name}</div>
              <div className="s">{p.tagline}</div>
            </div>
            <div className="plan-price">{money(p.priceCents)}<small>/mo</small></div>
          </div>
          <ul className="plan-feats">
            {p.features.map((f) => <li key={f}>{f}</li>)}
          </ul>
          <button
            type="button"
            className={`btn ${p.highlight ? '' : 'outline'}`}
            disabled={current?.planCode === p.code}
            onClick={() => (current ? switchPlan(p) : choose(p))}
          >
            {current?.planCode === p.code ? 'Your current plan' : current ? `Switch to ${p.name}` : `Continue with ${p.name}`}
          </button>
        </div>
      ))}

      <div className="card plan-addon">
        <div className="row">
          <div className="grow">
            <div className="n">{data.session.name}</div>
            <div className="s">{data.session.durationMin} minutes with your specialist. Book as needed, on any plan.</div>
          </div>
          <div className="plan-price">{money(data.session.priceCents)}</div>
        </div>
      </div>

      {!current && (
        <button type="button" className="btn" onClick={() => choose(highlighted)}>Continue with {highlighted.name}</button>
      )}

      <p className="legal-note">
        Education and planning, not credit repair. Any disputes are yours to send; we help you prepare them.
        No results are guaranteed. Plans renew monthly until you cancel. <Link to="/terms">Terms</Link>.
      </p>
    </div>
  );

  async function switchPlan(p) {
    try {
      const { subscription } = await billingApi.changePlan(p.code);
      setCurrent(subscription);
      navigate('/billing');
    } catch (e) {
      setError(e.message);
    }
  }
}
