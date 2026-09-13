import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { billing as billingApi } from '../../api/client.js';
import ScreenTop from '../../components/ScreenTop.jsx';
import PaymentField from '../../components/PaymentField.jsx';
import { money } from './Plans.jsx';

const fmtSlot = (iso) => {
  const d = new Date(iso);
  return `${d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} · ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
};

// $89 / 45-minute 1:1 counseling. Independent add-on on every tier. Charges the
// card on file when the member has a plan; otherwise takes a card here.
export default function BookSession() {
  const navigate = useNavigate();
  const [slots, setSlots] = useState(null);
  const [session, setSession] = useState(null);
  const [me, setMe] = useState(null);
  const [catalog, setCatalog] = useState(null);
  const [type, setType] = useState('video');
  const [slot, setSlot] = useState(null);
  const [topic, setTopic] = useState('');
  const [token, setToken] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    billingApi.sessionSlots().then((d) => { setSlots(d.slots); setSession(d.session); }).catch((e) => setError(e.message));
    billingApi.me().then(setMe).catch(() => setMe({}));
    billingApi.plans().then(setCatalog).catch(() => {});
  }, []);

  if (!slots || !session || !me) return <div className="loading">Loading…</div>;
  const hasCard = Boolean(me.subscription);
  const ready = slot && (hasCard || token);

  async function book() {
    setBusy(true);
    setError(null);
    try {
      await billingApi.bookSession({ type, scheduledAt: slot, topic: topic || undefined, paymentMethodToken: hasCard ? undefined : token });
      navigate('/billing');
    } catch (e) {
      setError(e.message || 'Could not book');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="content">
      <ScreenTop title="Book a 1:1 session" sub={`${session.durationMin} minutes with your specialist, ${money(session.priceCents)}`} right={<Link className="link" to="/billing">Back</Link>} />
      {error && <div className="error">{error}</div>}

      <div className="h2">Format</div>
      {[['video', 'Video call'], ['call', 'Phone call'], ['in_person', 'In person, Raleigh office']].map(([v, l]) => (
        <button key={v} type="button" className={`opt ${type === v ? 'sel' : ''}`} onClick={() => setType(v)}>
          <span className="n">{l}</span>{type === v && <span className="dot-sel" />}
        </button>
      ))}

      <div className="h2">Time</div>
      <div className="slot-grid">
        {slots.map((s) => (
          <button key={s} type="button" className={`slot ${slot === s ? 'sel' : ''}`} onClick={() => setSlot(s)}>{fmtSlot(s)}</button>
        ))}
      </div>

      <div className="field">
        <label>What do you want to cover? (optional)</label>
        <input value={topic} maxLength={300} placeholder="Budget review, dispute letter, lender questions…" onChange={(e) => setTopic(e.target.value)} />
      </div>

      <div className="h2">Payment</div>
      {hasCard ? (
        <div className="card muted-card">Charging {me.subscription.paymentMethod || 'your card on file'}: {money(session.priceCents)}.</div>
      ) : (
        <PaymentField processor={catalog?.processor} onToken={(t) => setToken(t)} />
      )}

      <button type="button" className="btn" disabled={!ready || busy} onClick={book}>{busy ? 'Booking…' : `Pay ${money(session.priceCents)} and book`}</button>
      <p className="legal-note">Full refund if you cancel at least 24 hours before the session. Counseling is guidance on your plan and file; it is not legal, tax, or lending advice and does not promise any credit outcome.</p>
    </div>
  );
}
