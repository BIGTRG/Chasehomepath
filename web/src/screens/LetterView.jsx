import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { credit as creditApi } from '../api/client.js';
import ScreenTop from '../components/ScreenTop.jsx';
import { COUNSELOR } from '../brand.js';

// One letter: read, edit, sign, then mail it yourself or have it mailed, then keep the proof. The member's hands on every step.
const money = (c) => (c / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const fmtDay = (d) => new Date(`${String(d).slice(0, 10)}T12:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
const MAIL_STATUS = { queued: 'being printed', printed: 'handed to USPS', in_transit: 'in transit', delivered: 'delivered and signed for', returned: 'returned to sender', failed: 'not accepted' };
const PROOF_LABEL = { signed_letter: 'Signed letter', certified_receipt: 'Certified Mail receipt', return_receipt: 'Return receipt', delivery_proof: 'Delivery confirmation', other: 'Other proof' };
export default function LetterView() {
  const { id } = useParams();
  const [c, setC] = useState(null);
  const [body, setBody] = useState('');
  const [dirty, setDirty] = useState(false);
  const [signed, setSigned] = useState('');
  const [sent, setSent] = useState({ method: 'certified_mail', sentOn: new Date().toISOString().slice(0, 10), tracking: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [quote, setQuote] = useState(null);
  const [agree, setAgree] = useState(false);
  const [card, setCard] = useState('');
  const [path, setPath] = useState(null); // 'service' | 'self'
  const [proofKind, setProofKind] = useState(null);
  const fileRef = useRef(null);

  useEffect(() => {
    creditApi.letterCase(id).then((data) => { setC(data); setBody(data.letters.find((l) => l.id === id)?.body ?? ''); }).catch((e) => setError(e.message));
  }, [id]);
  const status = c?.letters.find((x) => x.id === id)?.status;
  const serviceOn = c?.mailService?.enabled;
  useEffect(() => {
    if (status === 'approved' && serviceOn) creditApi.mailQuote(id).then(setQuote).catch(() => setQuote(null));
  }, [id, status, serviceOn]);

  async function onProofFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !proofKind) return;
    const dataBase64 = await new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result).split(',')[1]); r.onerror = reject; r.readAsDataURL(file); });
    await act(() => creditApi.attachProof(id, { kind: proofKind, fileName: file.name || 'proof.jpg', mimeType: file.type || 'image/jpeg', dataBase64 }));
    setProofKind(null);
  }
  function pickProof(kind) { setProofKind(kind); setTimeout(() => fileRef.current?.click(), 0); }

  async function act(fn) { setBusy(true); setError(null); try { const d = await fn(); setC(d); setBody(d.letters.find((l) => l.id === id)?.body ?? ''); setDirty(false); } catch (e) { setError(e.message); } finally { setBusy(false); } }

  if (error && !c) return <div className="content"><div className="error">{error}</div></div>;
  if (!c) return <div className="loading">Loading…</div>;
  const l = c.letters.find((x) => x.id === id);
  if (!l) return <div className="content"><div className="error">Letter not found</div></div>;
  const editable = l.status !== 'sent';
  const online = l.kind === 'cfpb_complaint';

  async function copy() { try { await navigator.clipboard.writeText(body); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { setError('Copy failed. Select the text and copy it.'); } }

  return (
    <div className="content">
      <ScreenTop title={`To ${l.recipient_name}`} sub={`Round ${l.round} · ${l.status === 'sent' ? 'sent' : l.status === 'approved' ? 'signed' : 'draft'}`} right={<Link to={`/credit/cases/${c.dispute.id}`} className="link-orange">Case</Link>} />

      <div className="card">
        <div className="n">{COUNSELOR.name}'s notes</div>
        <ol className="steps">{l.steps.map((s) => <li key={s}>{s}</li>)}</ol>
      </div>

      {editable ? (
        <textarea className="letter" value={body} onChange={(e) => { setBody(e.target.value); setDirty(true); }} spellCheck aria-label="Letter text" />
      ) : (
        <div className="letter-paper">{body}</div>
      )}
      {dirty && <button type="button" className="btn ghost" disabled={busy} onClick={() => act(() => creditApi.editLetter(id, { body }))}>Save my changes</button>}

      {l.status === 'draft' && !dirty && (
        <div className="card hl">
          <div className="n">Sign it</div>
          <div className="s" style={{ marginBottom: 8 }}>Type your full name as it appears on your ID. This is your signature on the letter.</div>
          <div className="field"><input value={signed} onChange={(e) => setSigned(e.target.value)} placeholder="Your full name" autoComplete="name" /></div>
          <button type="button" className="btn" disabled={busy || signed.trim().length < 3} onClick={() => act(() => creditApi.signLetter(id, { signedName: signed }))}>I approve and sign this letter</button>
        </div>
      )}

      {l.status !== 'draft' && (
        <>
          <div className="btn-row" style={{ marginTop: 12 }}>
            {!online && <button type="button" className="btn" onClick={() => window.print()}>Print or save PDF</button>}
            <button type="button" className={`btn ${online ? '' : 'ghost'}`} onClick={copy}>{copied ? 'Copied' : 'Copy text'}</button>
          </div>
          {l.online && <a className="center-link" href={l.online} target="_blank" rel="noopener">Open {l.recipient_name}'s online {online ? 'complaint form' : 'dispute portal'}</a>}
        </>
      )}

      {l.status === 'approved' && !online && (
        <div className="card">
          <div className="n">Now get it to {l.recipient_name}</div>
          <div className="s" style={{ marginBottom: 8 }}>Certified Mail is the strong recommendation: the receipt proves the date, and the return receipt proves they got it.</div>
          {c.mailService?.enabled && quote?.canMail && (
            <button type="button" className={`opt ${path === 'service' ? 'sel' : ''}`} onClick={() => setPath('service')}>
              <span className="opt-body"><span className="n">Mail it for me · {money(quote.amountCents)}</span><span className="s">Printed and sent by USPS Certified Mail with electronic return receipt. Copy, tracking, and delivery receipt land in your records.</span></span>
              {path === 'service' && <span className="dot-sel" />}
            </button>
          )}
          <button type="button" className={`opt ${path === 'self' ? 'sel' : ''}`} onClick={() => setPath('self')}>
            <span className="opt-body"><span className="n">I will print, sign, and mail it myself</span><span className="s">Print it, add your ID and proof of address, take it to the Post Office, then mark it sent here and photograph your receipt.</span></span>
            {path === 'self' && <span className="dot-sel" />}
          </button>
        </div>
      )}

      {l.status === 'approved' && path === 'service' && quote && (
        <div className="card hl">
          <div className="n">Mail it for me</div>
          {quote.breakdown.map((b) => <div className="row" key={b.label} style={{ padding: '4px 0' }}><div className="grow s">{b.label}</div><div className="s" style={{ fontWeight: 600 }}>{money(b.amountCents)}</div></div>)}
          <div className="row" style={{ padding: '4px 0', borderTop: '1px solid var(--line)' }}><div className="grow n">Total, at the carrier's price</div><div className="n">{money(quote.amountCents)}</div></div>
          <div className="s" style={{ margin: '8px 0' }}>{quote.pages} page{quote.pages === 1 ? '' : 's'}. The letter goes exactly as you signed it.</div>
          <div className="field"><label>Card or bank on file is used. New card (optional)</label><input value={card} onChange={(e) => setCard(e.target.value)} placeholder="Leave blank to use what is on file" autoComplete="off" /></div>
          <label className="consent-row">
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
            <span>{quote.consentText}</span>
          </label>
          <button type="button" className="btn" disabled={busy || !agree} onClick={() => act(() => creditApi.mailLetter(id, { consentAccepted: agree, paymentMethodToken: card.trim() || undefined }))}>Mail it for me · {money(quote.amountCents)}</button>
        </div>
      )}

      {l.status === 'approved' && (online || path === 'self') && (
        <div className="card">
          <div className="n">Mark it sent</div>
          <div className="s" style={{ marginBottom: 8 }}>This starts the 30-day clock. Keep your receipt.</div>
          {(online ? [['online', 'Submitted online']] : [['certified_mail', 'USPS Certified Mail, return receipt (recommended)'], ['mail', 'Regular mail'], ['online', 'Online portal'], ['fax', 'Fax']]).map(([k, lab]) => (
            <button type="button" key={k} className={`opt ${sent.method === k ? 'sel' : ''}`} onClick={() => setSent({ ...sent, method: k })}><span className="n">{lab}</span>{sent.method === k && <span className="dot-sel" />}</button>
          ))}
          {!online && sent.method === 'mail' && <div className="s" style={{ color: 'var(--orange)', margin: '4px 0 8px' }}>Regular mail leaves you with no proof of the date or that they got it. Certified Mail costs a few dollars more and protects the whole dispute.</div>}
          <div className="mrow" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div className="field"><label>Date sent</label><input type="date" value={sent.sentOn} onChange={(e) => setSent({ ...sent, sentOn: e.target.value })} /></div>
            <div className="field"><label>{sent.method === 'certified_mail' ? 'Certified tracking number' : 'Tracking or confirmation'}</label><input value={sent.tracking} onChange={(e) => setSent({ ...sent, tracking: e.target.value })} placeholder={sent.method === 'certified_mail' ? '9407 ...' : 'optional'} /></div>
          </div>
          <button type="button" className="btn" disabled={busy} onClick={() => act(() => creditApi.markSent(id, { ...sent, tracking: sent.tracking || undefined }))}>I sent it</button>
        </div>
      )}

      {l.status === 'sent' && (
        <>
          <div className="card gl">
            <div className="n">Sent {fmtDay(l.sent_at)}{l.sent_method === 'mail_service' ? ' for you' : ''}</div>
            <div className="s">{l.sent_method === 'mail_service' ? `${c.mailService?.carrier ?? 'Certified mail'} · ${MAIL_STATUS[l.mail_status] ?? 'in progress'}${l.expected_delivery && l.mail_status !== 'delivered' ? ` · expected ${fmtDay(l.expected_delivery)}` : ''}` : String(l.sent_method).replace('_', ' ')}{l.tracking ? ` · ${l.tracking}` : ''} · signed by {l.signed_name}</div>
            {l.mail_cost_cents != null && <div className="s">Paid {money(l.mail_cost_cents)} at the carrier's price</div>}
          </div>

          <div className={`card ${l.proofsMissing?.length ? 'hl' : ''}`}>
            <div className="n">Your proof of mailing</div>
            <div className="s" style={{ marginBottom: 8 }}>{l.proofsMissing?.length ? `Take a photo of each one now. It stays in your records so the proof is always there if anyone asks.` : 'Everything is on file.'}</div>
            {(l.proofs ?? []).map((p) => <div className="row" key={p.id} style={{ padding: '4px 0' }}><span className="dot g" /><div className="grow s" style={{ color: 'var(--ink)' }}>{PROOF_LABEL[p.kind] ?? p.kind}{p.source !== 'member' ? ' (saved for you)' : ''}</div><div className="s">{new Date(p.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div></div>)}
            {(l.proofsMissing ?? []).map((k) => <button type="button" key={k} className="btn ghost" disabled={busy} onClick={() => pickProof(k)}>Photograph the {PROOF_LABEL[k].toLowerCase()}</button>)}
            {!l.proofsMissing?.length && l.sent_method !== 'mail_service' && !(l.proofs ?? []).some((p) => p.kind === 'return_receipt') && <button type="button" className="btn ghost" disabled={busy} onClick={() => pickProof('return_receipt')}>Add the return receipt when it comes back</button>}
            <input ref={fileRef} type="file" accept="image/*,application/pdf" capture="environment" style={{ display: 'none' }} onChange={onProofFile} />
          </div>
        </>
      )}

      {error && <div className="error">{error}</div>}
      <div className="print-letter" aria-hidden="true">{body}{l.signed_name && l.status !== 'draft' ? `\n\nSigned: ${l.signed_name}` : ''}</div>
    </div>
  );
}
