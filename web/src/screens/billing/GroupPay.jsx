import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { billing as billingApi } from '../../api/client.js';
import ScreenTop from '../../components/ScreenTop.jsx';
import PaymentField from '../../components/PaymentField.jsx';
import { money } from './Plans.jsx';

// Group seat checkout for members without a card on file.
export default function GroupPay() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [g, setG] = useState(null);
  const [processor, setProcessor] = useState(null);
  const [token, setToken] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    billingApi.counseling().then((d) => setG(d.groupSessions.find((x) => x.id === id) || false)).catch((e) => setError(e.message));
    billingApi.plans().then((d) => setProcessor(d.processor)).catch(() => {});
  }, [id]);

  if (g === false) return <div className="content"><div className="error">Session not found.</div><Link to="/counseling">Back</Link></div>;
  if (!g) return <div className="loading">Loading…</div>;

  async function pay() {
    setBusy(true);
    setError(null);
    try {
      await billingApi.joinGroup(id, { paymentMethodToken: token });
      navigate('/billing');
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  return (
    <div className="content">
      <ScreenTop title="Take a seat" sub={g.title} right={<Link className="link" to="/counseling">Back</Link>} />
      <div className="card summary">
        <div className="row"><div className="grow n">{g.title}</div><div className="n">{money(g.priceCents)}</div></div>
        <div className="row"><div className="grow s">{new Date(g.scheduledAt).toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' })}</div></div>
      </div>
      {error && <div className="error">{error}</div>}
      <div className="h2">Payment</div>
      <PaymentField processor={processor} onToken={(t) => setToken(t)} />
      <button type="button" className="btn" disabled={!token || busy} onClick={pay}>{busy ? 'Processing…' : `Pay ${money(g.priceCents)} and reserve`}</button>
      <p className="legal-note">Full refund if you cancel at least 24 hours before the session starts.</p>
    </div>
  );
}
