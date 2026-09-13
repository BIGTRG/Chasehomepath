import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { billing as billingApi, journey as journeyApi } from '../../api/client.js';
import ScreenTop from '../../components/ScreenTop.jsx';
import PaymentField from '../../components/PaymentField.jsx';
import { money } from './Plans.jsx';

// Checkout: one plan, one card, one explicit consent (FTC negative-option rule:
// price, renewal, and cancel path stated before the button, stored server-side).
export default function Checkout() {
  const { planCode } = useParams();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const meetingId = params.get('meeting');
  const [catalog, setCatalog] = useState(null);
  const [token, setToken] = useState(null);
  const [methodLabel, setMethodLabel] = useState(null);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    billingApi.plans().then(setCatalog).catch((e) => setError(e.message));
  }, []);

  if (!catalog) return <div className="loading">Loading…</div>;
  const plan = catalog.plans.find((p) => p.code === planCode);
  if (!plan) return <div className="content"><div className="error">Plan not found.</div><Link to="/plans">Back to plans</Link></div>;

  async function pay() {
    setBusy(true);
    setError(null);
    try {
      await billingApi.subscribe({ planCode, paymentMethodToken: token, consentAccepted: true });
      if (meetingId) {
        // Paid inside the meeting with Maren: close the consultation and go set up training.
        try { await journeyApi.completeMeeting(meetingId, planCode); } catch { /* already closed */ }
        navigate('/start/training', { replace: true });
        return;
      }
      navigate('/billing', { state: { justSubscribed: true } });
    } catch (e) {
      setError(e.message || 'Payment did not go through');
    } finally {
      setBusy(false);
    }
  }

  const nextCharge = new Date();
  nextCharge.setMonth(nextCharge.getMonth() + 1);

  return (
    <div className="content">
      <ScreenTop title="Start your plan" sub={`${plan.name}, ${plan.tagline.toLowerCase()}`} right={<Link className="link" to="/plans">Change</Link>} />

      <div className="card summary">
        <div className="row"><div className="grow n">{plan.name} plan</div><div className="n">{money(plan.priceCents)}/mo</div></div>
        <div className="row"><div className="grow s">Today</div><div className="s">{money(plan.priceCents)}</div></div>
        <div className="row"><div className="grow s">Next charge</div><div className="s">{nextCharge.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div></div>
        <div className="row"><div className="grow s">1:1 counseling</div><div className="s">{money(catalog.session.priceCents)} per session, optional</div></div>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="h2">Payment</div>
      <PaymentField processor={catalog.processor} onToken={(t, l) => { setToken(t); setMethodLabel(l); }} />

      <label className="consent">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span>
          {plan.consentText}
          {methodLabel?.startsWith('Bank') && (
            <> I authorize CHASE HomePath (TRG Tech Link) to electronically debit my bank account for {money(plan.priceCents)} on or about the same day each month, and for any session I book at the price shown when I book it. This authorization stays in effect until I cancel in the app or notify support@chasehomepath.com. A returned debit may be retried once.</>
          )}
        </span>
      </label>

      <button type="button" className="btn" disabled={!token || !consent || busy} onClick={pay}>
        {busy ? 'Processing…' : `Pay ${money(plan.priceCents)} and start`}
      </button>
      <p className="legal-note">
        By paying you agree to the <Link to="/terms">Terms of Service</Link> and <Link to="/privacy">Privacy Policy</Link>.
        Cancel anytime from Billing; access continues to the end of the paid month.
      </p>
    </div>
  );
}
