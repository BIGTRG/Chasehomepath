import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api/client.js';

// Password reset, step 2: the emailed link lands here with ?token=…
export default function Reset() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function onSubmit(e) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    setBusy(true);
    try {
      await api('/auth/reset', { method: 'POST', body: { token, password }, auth: false });
      navigate('/login', { replace: true, state: { notice: 'Password updated — sign in with your new password.' } });
    } catch (err) {
      setError(err.message || 'This reset link is invalid or has expired');
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <div className="content">
        <img src="/logo.png" alt="CHASE HomePath" className="auth-logo" style={{ margin: '28px auto 10px' }} />
        <h1 className="h1" style={{ textAlign: 'center' }}>Link missing</h1>
        <p className="sub" style={{ textAlign: 'center' }}>Use the reset link from your email, or request a new one.</p>
        <p className="center-link"><Link to="/forgot">Request a new link</Link></p>
      </div>
    );
  }

  return (
    <div className="content">
      <img src="/logo.png" alt="CHASE HomePath" className="auth-logo" style={{ margin: '28px auto 10px' }} />
      <h1 className="h1">Choose a new password</h1>
      <p className="sub">At least 10 characters.</p>
      {error && <div className="error">{error}</div>}
      <form onSubmit={onSubmit}>
        <div className="field">
          <label htmlFor="password">New password</label>
          <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required />
        </div>
        <div className="field">
          <label htmlFor="confirm">Repeat new password</label>
          <input id="confirm" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required />
        </div>
        <button className="btn" type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Set new password'}
        </button>
      </form>
    </div>
  );
}
