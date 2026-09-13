import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { journey as journeyApi, api } from '../../api/client.js';
import ScreenTop from '../../components/ScreenTop.jsx';
import { COUNSELOR } from '../../brand.js';

const AFFILIATE_URL = 'https://www.smartcredit.com/join/?pid=79173';

// Step 2: credit monitoring with SmartCredit. Opens their signup in a sheet with the
// member's details ready to paste, then the member confirms. Direct in-app enrollment
// lands when the ConsumerDirect partner API is approved; this screen does not change.
export default function CreditMonitoring() {
  const navigate = useNavigate();
  const [opened, setOpened] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function open() {
    setOpened(true);
    try { await api('/smartcredit/click', { method: 'POST' }); } catch { /* tracking only */ }
    window.open(AFFILIATE_URL, '_blank', 'noopener');
  }
  async function confirm(status) {
    setBusy(true); setError(null);
    try { await journeyApi.enroll(status); navigate('/start/docs'); } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  return (
    <div className="content">
      <ScreenTop title="Credit monitoring" sub="Step 2 of 7" />
      <div className="card hl">
        <div className="n">Why this comes first</div>
        <p className="s" style={{ margin: '4px 0 0', lineHeight: 1.5 }}>Your three-bureau report and scores flow into your plan and update every month. {COUNSELOR.name} reads every line so you never have to. We hold the review until your meeting; you will see it explained, not dumped on you.</p>
      </div>

      <div className="card">
        <div className="n">1. Sign up with SmartCredit</div>
        <p className="s" style={{ margin: '4px 0 8px' }}>Use the same name and email you just used here. Identity questions come from the bureaus, not us. About three minutes.</p>
        <button type="button" className="btn" onClick={open}>Open SmartCredit signup</button>
      </div>

      <div className={`card ${opened ? '' : 'dim'}`}>
        <div className="n">2. Come back and confirm</div>
        <p className="s" style={{ margin: '4px 0 8px' }}>Tap once you finish. If you already have a SmartCredit account, link it instead.</p>
        {error && <div className="error">{error}</div>}
        <button type="button" className="btn" disabled={busy} onClick={() => confirm('enrolled')}>I finished signing up</button>
        <button type="button" className="btn outline" disabled={busy} onClick={() => confirm('linked')} style={{ marginTop: 8 }}>I already have SmartCredit</button>
      </div>

      <button type="button" className="link" style={{ background: 'none', border: 0, margin: '8px auto', display: 'block', font: 'inherit' }} disabled={busy} onClick={() => confirm('declined')}>Not now, continue without monitoring</button>
      <p className="legal-note">SmartCredit is a ConsumerDirect product with its own fee and terms. CHASE HomePath may receive a referral fee; it never changes your price. Monitoring is a soft pull and does not lower your score.</p>
    </div>
  );
}
