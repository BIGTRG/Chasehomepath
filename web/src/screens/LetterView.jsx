import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { credit as creditApi } from '../api/client.js';
import ScreenTop from '../components/ScreenTop.jsx';
import { COUNSELOR } from '../brand.js';

// One letter: read, edit, sign, print or copy, mark sent. The member's hands on every step.
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

  useEffect(() => {
    creditApi.letterCase(id).then((data) => { setC(data); setBody(data.letters.find((l) => l.id === id)?.body ?? ''); }).catch((e) => setError(e.message));
  }, [id]);

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

      {l.status === 'approved' && (
        <div className="card">
          <div className="n">Mark it sent</div>
          <div className="s" style={{ marginBottom: 8 }}>This starts the 30-day clock. Keep your receipt.</div>
          {(online ? [['online', 'Submitted online']] : [['certified_mail', 'Certified mail, return receipt'], ['mail', 'Regular mail'], ['online', 'Online portal'], ['fax', 'Fax']]).map(([k, lab]) => (
            <button type="button" key={k} className={`opt ${sent.method === k ? 'sel' : ''}`} onClick={() => setSent({ ...sent, method: k })}><span className="n">{lab}</span>{sent.method === k && <span className="dot-sel" />}</button>
          ))}
          <div className="mrow" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div className="field"><label>Date sent</label><input type="date" value={sent.sentOn} onChange={(e) => setSent({ ...sent, sentOn: e.target.value })} /></div>
            <div className="field"><label>Tracking or confirmation</label><input value={sent.tracking} onChange={(e) => setSent({ ...sent, tracking: e.target.value })} placeholder="optional" /></div>
          </div>
          <button type="button" className="btn" disabled={busy} onClick={() => act(() => creditApi.markSent(id, { ...sent, tracking: sent.tracking || undefined }))}>I sent it</button>
        </div>
      )}

      {l.status === 'sent' && <div className="card gl"><div className="n">Sent {new Date(`${String(l.sent_at).slice(0, 10)}T12:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}</div><div className="s">{String(l.sent_method).replace('_', ' ')}{l.tracking ? ` · ${l.tracking}` : ''} · signed by {l.signed_name}</div></div>}

      {error && <div className="error">{error}</div>}
      <div className="print-letter" aria-hidden="true">{body}{l.signed_name && l.status !== 'draft' ? `\n\nSigned: ${l.signed_name}` : ''}</div>
    </div>
  );
}
