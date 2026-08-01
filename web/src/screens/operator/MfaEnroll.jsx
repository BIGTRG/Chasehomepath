import { useEffect, useState } from 'react';
import { api } from '../../api/client.js';
import { useAuth } from '../../auth/AuthContext.jsx';

// Mandatory MFA enrollment gate for staff (GLBA Safeguards posture): shown
// instead of the console until the account has TOTP enabled.
export default function MfaEnroll() {
  const { logout, refreshUser } = useAuth();
  const [enrollment, setEnrollment] = useState(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api('/auth/mfa/setup', { method: 'POST' })
      .then(setEnrollment)
      .catch((err) => setError(err.message || 'Could not start MFA setup'));
  }, []);

  async function onSubmit(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api('/auth/mfa/enable', { method: 'POST', body: { secret: enrollment.secret, token: code } });
      await refreshUser();
    } catch (err) {
      setError(err.message || 'That code did not verify — try the next one');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="content" style={{ maxWidth: 460, margin: '0 auto' }}>
      <img src="/logo.png" alt="CHASE HomePath" className="auth-logo sm" style={{ margin: '26px auto 14px' }} />
      <h1 className="h1" style={{ textAlign: 'center' }}>Secure your staff account</h1>
      <p className="sub" style={{ textAlign: 'center' }}>
        Staff accounts handle member financial data, so two-step verification is required.
        Scan the code with any authenticator app (Google Authenticator, 1Password, Authy),
        then enter the 6-digit code.
      </p>

      {error && <div className="error">{error}</div>}

      {enrollment ? (
        <>
          <img src={enrollment.qrDataUrl} alt="Scan with your authenticator app" style={{ display: 'block', width: 200, height: 200, margin: '10px auto', background: '#fff', borderRadius: 12, padding: 8 }} />
          <p className="sub" style={{ textAlign: 'center', fontSize: 12 }}>
            Can't scan? Enter this key manually: <code>{enrollment.secret}</code>
          </p>
          <form onSubmit={onSubmit}>
            <div className="field">
              <label htmlFor="code">6-digit code</label>
              <input id="code" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" required />
            </div>
            <button className="btn" type="submit" disabled={busy || code.trim().length < 6}>
              {busy ? 'Verifying…' : 'Turn on two-step verification'}
            </button>
          </form>
        </>
      ) : !error && <p className="sub" style={{ textAlign: 'center' }}>Preparing setup…</p>}

      <p className="center-link" style={{ marginTop: 18 }}>
        <button className="linklike" onClick={logout}>Sign out</button>
      </p>
    </div>
  );
}
