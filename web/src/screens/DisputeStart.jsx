import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { credit as creditApi } from '../api/client.js';
import ScreenTop from '../components/ScreenTop.jsx';
import { COUNSELOR } from '../brand.js';

// Start a dispute: the member says what is wrong, Maren drafts the letters. The member owns
// every step after this; nothing is sent by the system.
export default function DisputeStart() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [item, setItem] = useState(null);
  const [opts, setOpts] = useState(null);
  const [reason, setReason] = useState(null);
  const [details, setDetails] = useState('');
  const [bureaus, setBureaus] = useState(['experian', 'equifax', 'transunion']);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([creditApi.item(id), creditApi.disputeOptions()]).then(([d, o]) => { setItem(d.item); setOpts(o); }).catch((e) => setError(e.message));
  }, [id]);

  if (error && !opts) return <div className="content"><div className="error">{error}</div></div>;
  if (!opts || !item) return <div className="loading">Loading…</div>;

  const chosen = opts.reasons.find((r) => r.code === reason);
  const toggle = (k) => setBureaus(bureaus.includes(k) ? bureaus.filter((b) => b !== k) : [...bureaus, k]);

  async function start() {
    setBusy(true); setError(null);
    try {
      const c = await creditApi.startDispute(id, { reasonCode: reason, details: details.trim() || undefined, bureaus });
      navigate(`/credit/cases/${c.dispute.id}`, { replace: true });
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  return (
    <div className="content">
      <ScreenTop title="Question this item" sub={`${item.creditor} · $${Number(item.balance ?? 0).toLocaleString()}`} />

      <div className="card hl">
        <div className="n">How this works</div>
        <div className="s" style={{ lineHeight: 1.5 }}>Tell {COUNSELOR.name} what is wrong. She drafts a letter to each bureau in your name, citing your rights. You read it, sign it, and send it. She tracks the 30-day clock and drafts the next move if they push back. You are the one disputing; we make it easy to do right.</div>
      </div>

      <div className="lbl">What is wrong with it</div>
      {opts.reasons.map((r) => (
        <button type="button" key={r.code} className={`opt ${reason === r.code ? 'sel' : ''}`} onClick={() => setReason(r.code)}>
          <span className="n">{r.label}</span>
          {reason === r.code && <span className="dot-sel" />}
        </button>
      ))}

      {chosen && (
        <>
          <div className="lbl">In your own words (optional)</div>
          <div className="field">
            <textarea rows={4} maxLength={1500} value={details} onChange={(e) => setDetails(e.target.value)} placeholder="Dates, amounts, who you spoke to. Facts only; this goes in the letter." />
          </div>

          <div className="lbl">Send to</div>
          <div className="card list">
            {opts.bureaus.map((b) => (
              <label className="row" key={b.key} style={{ cursor: 'pointer' }}>
                <input type="checkbox" checked={bureaus.includes(b.key)} onChange={() => toggle(b.key)} style={{ width: 18, height: 18, accentColor: 'var(--orange)' }} />
                <div className="grow"><div className="n">{b.name}</div><div className="s">Only bureaus that show this item. Uncheck any that do not.</div></div>
              </label>
            ))}
          </div>

          <div className="lbl">Have these ready to copy and enclose</div>
          <div className="card">
            <ul className="steps">
              <li>Copy of your government ID</li>
              <li>Proof of your current address</li>
              {chosen.evidence.filter((e) => !/ID|address/i.test(e)).map((e) => <li key={e}>{e}</li>)}
            </ul>
          </div>
        </>
      )}

      {error && <div className="error">{error}</div>}
      <button type="button" className="btn" disabled={!reason || bureaus.length === 0 || busy} onClick={start}>{busy ? 'Drafting…' : `Have ${COUNSELOR.name} draft my letters`}</button>
      <button type="button" className="btn secondary" onClick={() => navigate(-1)}>Not now</button>
    </div>
  );
}
