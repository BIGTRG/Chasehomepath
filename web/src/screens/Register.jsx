import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';

// Walkthrough screen B: signup asks only what's needed to start. Everything else
// comes through the guided intake, not a long form. (spec §4.1, §8 data-never-sold)
export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '' });
  const [agreed, setAgreed] = useState(false);
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
        consent: { terms: agreed, dataNeverSold: agreed },
      });
      navigate('/qualify', { replace: true });
    } catch (err) {
      setError(err.details?.[0]?.message || err.message || 'Could not create account');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="content">
      <h1 className="h1">Create your account</h1>
      <p className="sub">Takes about a minute</p>

      <img src="/logo.png" alt="CHASE HomePath" className="auth-logo sm" style={{ margin: '6px auto 22px' }} />

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
          <label htmlFor="phone">Mobile</label>
          <input id="phone" type="tel" value={form.phone} onChange={set('phone')} autoComplete="tel" />
        </div>
        <div className="field">
          <label htmlFor="password">Create password</label>
          <input id="password" type="password" value={form.password} onChange={set('password')}
            autoComplete="new-password" required minLength={10} />
          <div className="mfa-hint" style={{ marginTop: 6 }}>At least 10 characters.</div>
        </div>

        <div className="card">
          <label className="consent" style={{ marginBottom: 0 }}>
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
            <span>
              I agree to the <strong>Terms</strong> and <strong>Privacy Policy</strong>. My data is never sold.
            </span>
          </label>
        </div>

        <button className="btn" type="submit" disabled={busy || !agreed}>
          {busy ? 'Creating account…' : 'Create account & start'}
        </button>
      </form>

      <p className="center-link">
        Already have an account? <Link to="/login">Sign in</Link>
      </p>
    </div>
  );
}
