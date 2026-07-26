import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';

// Signup captures ONLY name/email/phone/password + consent (spec §4.1).
// The data-never-sold line is explicit (spec §8 "Data never sold").
export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '' });
  const [terms, setTerms] = useState(false);
  const [dataNeverSold, setDataNeverSold] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function onSubmit(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await register({
        name: form.name,
        email: form.email,
        phone: form.phone || undefined,
        password: form.password,
        consent: { terms, dataNeverSold },
      });
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.details?.[0]?.message || err.message || 'Could not create account');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="content">
      <h1 className="h1">Start your plan</h1>
      <p className="sub">A few details to get going. No credit pull here.</p>

      {error && <div className="error">{error}</div>}

      <form onSubmit={onSubmit}>
        <div className="field">
          <label htmlFor="name">Full name</label>
          <input id="name" value={form.name} onChange={set('name')} autoComplete="name" required />
        </div>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" type="email" value={form.email} onChange={set('email')} autoComplete="email" required />
        </div>
        <div className="field">
          <label htmlFor="phone">Phone (optional)</label>
          <input id="phone" type="tel" value={form.phone} onChange={set('phone')} autoComplete="tel" />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input id="password" type="password" value={form.password} onChange={set('password')}
            autoComplete="new-password" required minLength={10} />
          <div className="mfa-hint">At least 10 characters.</div>
        </div>

        <label className="consent">
          <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} />
          <span>I agree to the <strong>Terms of Service</strong> and Privacy Policy.</span>
        </label>
        <label className="consent">
          <input type="checkbox" checked={dataNeverSold} onChange={(e) => setDataNeverSold(e.target.checked)} />
          <span>
            I understand CHASE HomePath uses my information only to guide my plan and
            <strong> never sells my data</strong> to third parties.
          </span>
        </label>

        <button className="btn" type="submit" disabled={busy || !terms || !dataNeverSold}>
          {busy ? 'Creating account…' : 'Create account'}
        </button>
      </form>

      <p className="center-link">
        Already have an account? <Link to="/login">Sign in</Link>
      </p>
    </div>
  );
}
