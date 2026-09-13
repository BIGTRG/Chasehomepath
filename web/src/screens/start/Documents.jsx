import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { intake as intakeApi, money as moneyApi, journey as journeyApi } from '../../api/client.js';
import ScreenTop from '../../components/ScreenTop.jsx';
import { COUNSELOR } from '../../brand.js';

const OPTIONAL = new Set(['co_applicant_id']);

// Step 3: everything before the meeting. Income and area up top (the engine needs them),
// then camera capture for every document. The meeting button turns on when the gate is met.
export default function Documents() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [gate, setGate] = useState(null);
  const [intake, setIntake] = useState({ householdIncome: '', targetArea: '' });
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [pendingType, setPendingType] = useState(null);
  const fileRef = useRef(null);

  async function load() {
    try {
      const [c, s, mine] = await Promise.all([intakeApi.checklist(), journeyApi.status(), intakeApi.mine().catch(() => null)]);
      setData(c); setGate(s.docsGate);
      if (mine?.intake?.household_income) { setIntake({ householdIncome: String(mine.intake.household_income), targetArea: mine.intake.target_area || '' }); setSaved(true); }
    } catch (err) { setError(err.message); }
  }
  useEffect(() => { load(); }, []);

  async function saveIntake(e) {
    e.preventDefault();
    setBusy(true); setError(null);
    try { await intakeApi.save({ householdIncome: Number(intake.householdIncome), targetArea: intake.targetArea, authorizeCreditPull: true }); setSaved(true); await load(); } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  function snap(docType) { setPendingType(docType); fileRef.current?.click(); }
  async function onFile(e) {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file || !pendingType) return;
    setBusy(true); setError(null);
    try {
      const dataBase64 = await toBase64(file);
      await intakeApi.uploadDocument({ docType: pendingType, fileName: file.name || 'capture.jpg', mimeType: file.type || 'image/jpeg', dataBase64 });
      await load();
    } catch (err) { setError(err.message || 'Upload failed'); } finally { setBusy(false); setPendingType(null); }
  }
  async function linkBank() {
    setBusy(true); setError(null);
    try { await moneyApi.link('public-mock-token'); await moneyApi.sync(); await load(); } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  if (error && !data) return <div className="content"><div className="error">{error}</div></div>;
  if (!data || !gate) return <div className="loading">Loading…</div>;
  const pct = Math.round(((gate.done + (gate.incomeSet ? 1 : 0)) / (gate.total + 1)) * 100);

  return (
    <div className="content">
      <ScreenTop title="Upload everything" sub={`Step 3 of 6, ${pct}% done`} />
      <div className="bar" style={{ marginBottom: 14 }}><span style={{ width: `${pct}%` }} /></div>
      <p className="s" style={{ marginTop: 0, lineHeight: 1.5 }}>While you upload, the engine reads your credit, income, and debts and checks FHA, USDA, VA, conventional, credit-union, and assistance programs, so {COUNSELOR.name} opens your meeting with where you stand.</p>
      {error && <div className="error">{error}</div>}

      <form onSubmit={saveIntake} className={`card ${saved ? 'gl' : 'hl'}`}>
        <div className="n">Income and where you want to live</div>
        <div className="field" style={{ marginTop: 8 }}><label htmlFor="inc">Household income, yearly, before tax</label><input id="inc" type="number" inputMode="numeric" min="0" value={intake.householdIncome} onChange={(e) => setIntake({ ...intake, householdIncome: e.target.value })} required /></div>
        <div className="field"><label htmlFor="area">City or county</label><input id="area" value={intake.targetArea} onChange={(e) => setIntake({ ...intake, targetArea: e.target.value })} placeholder="Raleigh, NC" required /></div>
        <button className="btn small" type="submit" disabled={busy}>{saved ? 'Update' : 'Save'}</button>
      </form>

      {data.items.map((i) => (
        <div className={`chk-row ${i.done ? 'done' : ''}`} key={i.docType}>
          <span>{i.label}{OPTIONAL.has(i.docType) && <span className="s"> (optional)</span>}</span>
          {i.done ? <span className="tick">✓</span>
            : i.docType === 'bank_link' ? <button className="btn small" onClick={linkBank} disabled={busy} style={{ background: 'var(--tint)', color: 'var(--orange-dark)' }}>Link</button>
              : <button className="btn small" onClick={() => snap(i.docType)} disabled={busy} style={{ background: 'var(--tint)', color: 'var(--orange-dark)' }}>Snap</button>}
        </div>
      ))}
      <input ref={fileRef} type="file" accept="image/*,application/pdf" capture="environment" style={{ display: 'none' }} onChange={onFile} />
      <div className="gy" style={{ marginTop: 10 }}>Take a picture. No printing, scanning, or email. Encrypted at rest.</div>

      <button className="btn" disabled={!gate.complete} onClick={() => navigate('/start/book')} style={{ marginTop: 10 }}>
        {gate.complete ? 'Book your meeting' : `${gate.total - gate.done} document${gate.total - gate.done === 1 ? '' : 's'} to go`}
      </button>
    </div>
  );
}

function toBase64(file) {
  return new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result).split(',')[1]); r.onerror = reject; r.readAsDataURL(file); });
}
