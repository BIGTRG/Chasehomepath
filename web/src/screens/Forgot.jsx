import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';

// Password reset, step 1: ask for the email. The API answers the same way
// whether or not the account exists.
export default function Forgot() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function onSubmit(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api('/auth/forgot', { method: 'POST', body: { email }, auth: false });
      setSent(true);
    } catch (err) {
      setError(err.message || 'Something went wrong — try again');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="content">
      <img src="/logo.png" alt="CHASE HomePath" className="auth-logo" style={{ margin: '28px auto 10px' }} />
      <p className="auth-tagline">Ensuring the American Dream</p>

      {sent ? (
        <>
          <h1 className="h1" style={{ textAlign: 'center' }}>Check your email</h1>
          <p className="sub" style={{ textAlign: 'center' }}>
            If an account exists for {email}, a reset link is on its way. It works for 30 minutes.
          </p>
          <p className="center-link" style={{ marginTop: 22 }}>
            <Link to="/login">Back to sign in</Link>
          </p>
        </>
      ) : (
        <>
          <h1 className="h1">Reset your password</h1>
          <p className="sub">We'll email you a reset link.</p>
          {error && <div className="error">{error}</div>}
          <form onSubmit={onSubmit}>
            <div className="field">
              <label htmlFor="email">Email</label>
              <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
            </div>
            <button className="btn" type="submit" disabled={busy}>
              {busy ? 'Sending…' : 'Email me a reset link'}
            </button>
          </form>
          <p className="center-link" style={{ marginTop: 18 }}>
            <Link to="/login">Back to sign in</Link>
          </p>
        </>
      )}
    </div>
  );
}
