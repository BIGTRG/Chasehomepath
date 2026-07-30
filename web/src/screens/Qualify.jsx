import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { intake as intakeApi, credit as creditApi } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.jsx';

// Walkthrough screen 2: they enter their own info and authorize the pull.
// Self-service — this is the intake that replaces a front desk. (spec §4.3, §8)
const displayName = (email) =>
  String(email || '').split('@')[0].split(/[._\-+]/).filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');

export default function Qualify() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [income, setIncome] = useState('');
  const [area, setArea] = useState('');
  const [coApplicant, setCoApplicant] = useState('');
  const [showCo, setShowCo] = useState(false);
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await intakeApi.save({
        householdIncome: Number(income),
        targetArea: area,
        coApplicant: coApplicant.trim() ? { name: coApplicant.trim() } : undefined,
        authorizeCreditPull: agree,
      });
      await creditApi.pull();
      navigate('/received');
    } catch (err) {
      setError(err.message || 'Could not save your details');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="content">
      <h1 className="h1">Let's see where you are</h1>
      <p className="sub">Step 2 of 3</p>
      <div className="steps">
        <b className="on" /><b className="cur" /><b />
      </div>

      {error && <div className="error">{error}</div>}

      <form onSubmit={onSubmit}>
        <div className="field ok">
          <label>Your name</label>
          <input value={displayName(user?.email)} readOnly />
        </div>
        <div className={`field ${income ? 'ok' : ''}`}>
          <label htmlFor="income">Household income (yearly)</label>
          <input id="income" type="number" min="0" inputMode="numeric" value={income}
            onChange={(e) => setIncome(e.target.value)} required />
        </div>
        <div className={`field ${area ? 'ok' : ''}`}>
          <label htmlFor="area">Where you want to buy</label>
          <input id="area" value={area} onChange={(e) => setArea(e.target.value)}
            placeholder="City or county" required />
        </div>

        {showCo ? (
          <div className="field">
            <label htmlFor="co">Co-applicant name</label>
            <input id="co" value={coApplicant} onChange={(e) => setCoApplicant(e.target.value)} />
          </div>
        ) : (
          <button type="button" className="opt" onClick={() => setShowCo(true)}>
            <span className="n" style={{ color: 'var(--muted)', fontWeight: 500 }}>Add a co-applicant?</span>
            <span style={{ color: 'var(--orange)' }}>+</span>
          </button>
        )}

        <div className="lbl">Authorization</div>
        <div className="card hl">
          <p style={{ margin: '0 0 10px', fontSize: 13.5, lineHeight: 1.6 }}>
            I authorize CHASE HomePath to pull my credit to build my plan. I understand a
            fee applies and my score won't be shown yet.
          </p>
          <label className="consent" style={{ marginBottom: 0 }}>
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
            <span><strong>I agree</strong></span>
          </label>
        </div>

        <button className="btn" type="submit" disabled={busy || !agree}>
          {busy ? 'Working…' : 'Pull my credit & continue'}
        </button>
      </form>
    </div>
  );
}
