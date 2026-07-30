import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';

// Walkthrough screen A: logo-led, warm, mobile-first. The American Dream line anchors it.
export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mfaToken, setMfaToken] = useState('');
  const [mfaRequired, setMfaRequired] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email, password, mfaRequired ? mfaToken : undefined);
      navigate('/', { replace: true });
    } catch (err) {
      if (err.code === 'mfa_required') {
        setMfaRequired(true);
        setError('Enter the 6-digit code from your authenticator app.');
      } else {
        setError(err.message || 'Sign in failed');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="content auth-top">
      <img src="/logo.png" alt="CHASE HomePath" className="auth-logo" />
      <p className="auth-tagline">Ensuring the American Dream</p>

      {error && <div className="error">{error}</div>}

      <form onSubmit={onSubmit}>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" type="email" autoComplete="email" value={email}
            onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input id="password" type="password" autoComplete="current-password" value={password}
            onChange={(e) => setPassword(e.target.value)} required />
        </div>

        {mfaRequired && (
          <div className="field">
            <label htmlFor="mfa">Authentication code</label>
            <input id="mfa" inputMode="numeric" autoComplete="one-time-code" value={mfaToken}
              onChange={(e) => setMfaToken(e.target.value)} placeholder="123456" />
          </div>
        )}

        <button className="btn" type="submit" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      <p className="link-line">
        <a href="mailto:support@chasehomepath.com?subject=Password%20help">Forgot password?</a>
      </p>

      <p className="center-link">
        New here? <Link to="/register">Create your account</Link>
      </p>

      <p className="center-link" style={{ marginTop: 22 }}>
        <Link to="/discover">See how CHASE HomePath works →</Link>
      </p>
    </div>
  );
}
