import { useState } from 'react';

/**
 * Card entry that yields a processor token. Card numbers never reach our API:
 * with Stripe the token comes from Stripe.js Elements (loaded when a publishable
 * key is configured); in mock mode we tokenize locally to pm_mock_<last4>.
 * The parent receives `onToken(token, label)` once the field is complete.
 */
export default function PaymentField({ processor, onToken }) {
  const [num, setNum] = useState('');
  const [exp, setExp] = useState('');
  const [cvc, setCvc] = useState('');
  const [touched, setTouched] = useState(false);

  if (processor?.mode === 'stripe') {
    return <StripeField publishableKey={processor.publishableKey} onToken={onToken} />;
  }

  const digits = num.replace(/\D/g, '');
  const valid = digits.length >= 13 && /^\d{2}\/\d{2}$/.test(exp) && cvc.length >= 3;

  function update(next) {
    const d = next.replace(/\D/g, '').slice(0, 19);
    setNum(d.replace(/(\d{4})(?=\d)/g, '$1 '));
    setTouched(true);
    const ok = d.length >= 13 && /^\d{2}\/\d{2}$/.test(exp) && cvc.length >= 3;
    onToken(ok ? (d === '4000000000000002' ? 'pm_mock_declined' : `pm_mock_${d.slice(-4)}`) : null, ok ? `Card ending ${d.slice(-4)}` : null);
  }
  function updateExp(v) {
    const d = v.replace(/\D/g, '').slice(0, 4);
    const f = d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
    setExp(f);
    const ok = digits.length >= 13 && /^\d{2}\/\d{2}$/.test(f) && cvc.length >= 3;
    onToken(ok ? `pm_mock_${digits.slice(-4)}` : null, ok ? `Card ending ${digits.slice(-4)}` : null);
  }
  function updateCvc(v) {
    const d = v.replace(/\D/g, '').slice(0, 4);
    setCvc(d);
    const ok = digits.length >= 13 && /^\d{2}\/\d{2}$/.test(exp) && d.length >= 3;
    onToken(ok ? `pm_mock_${digits.slice(-4)}` : null, ok ? `Card ending ${digits.slice(-4)}` : null);
  }

  return (
    <div className="pay-field">
      <div className="field">
        <label>Card number</label>
        <input inputMode="numeric" autoComplete="cc-number" placeholder="1234 5678 9012 3456" value={num} onChange={(e) => update(e.target.value)} />
      </div>
      <div className="pay-row">
        <div className="field">
          <label>Expires</label>
          <input inputMode="numeric" autoComplete="cc-exp" placeholder="MM/YY" value={exp} onChange={(e) => updateExp(e.target.value)} />
        </div>
        <div className="field">
          <label>CVC</label>
          <input inputMode="numeric" autoComplete="cc-csc" placeholder="123" value={cvc} onChange={(e) => updateCvc(e.target.value)} />
        </div>
      </div>
      {touched && !valid && <div className="tsub">Enter the full card number, expiration, and CVC.</div>}
      <div className="pay-secure">Encrypted. Your card details are sent straight to the payment processor and never stored on CHASE HomePath servers.</div>
    </div>
  );
}

function StripeField({ publishableKey, onToken }) {
  // Stripe.js is loaded from js.stripe.com only when a live key is configured; the
  // CSP allows it in that deployment. Until then this branch is not rendered.
  const [err, setErr] = useState(null);
  const mountedRef = { current: false };
  function mount(node) {
    if (!node || mountedRef.current) return;
    mountedRef.current = true;
    const s = document.createElement('script');
    s.src = 'https://js.stripe.com/v3/';
    s.onload = () => {
      const stripe = window.Stripe(publishableKey);
      const elements = stripe.elements();
      const card = elements.create('card', { style: { base: { fontSize: '16px', color: '#1f1f1f' } } });
      card.mount(node);
      card.on('change', async (ev) => {
        if (!ev.complete) return onToken(null, null);
        const { paymentMethod, error } = await stripe.createPaymentMethod({ type: 'card', card });
        if (error) return setErr(error.message);
        setErr(null);
        onToken(paymentMethod.id, `${paymentMethod.card.brand} ending ${paymentMethod.card.last4}`);
      });
    };
    document.head.appendChild(s);
  }
  return (
    <div className="pay-field">
      <div className="field"><label>Card</label><div className="stripe-el" ref={mount} /></div>
      {err && <div className="error">{err}</div>}
      <div className="pay-secure">Encrypted by Stripe. Card details never touch CHASE HomePath servers.</div>
    </div>
  );
}
