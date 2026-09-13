import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { credit as creditApi } from '../api/client.js';
import ScreenTop from '../components/ScreenTop.jsx';
import { COUNSELOR } from '../brand.js';

const fmt = (d) => (d ? new Date(String(d).length === 10 ? `${d}T12:00:00` : d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '');
const KIND = { bureau_dispute: 'Dispute letter', mov_request: 'How did you verify this?', furnisher_direct: 'Direct dispute to creditor', debt_validation: 'Debt validation request', cfpb_complaint: 'CFPB complaint' };
const STATUS = { draft: ['Needs your review', 'w'], approved: ['Signed, ready to send', 'o'], sent: ['Sent', 'g'] };

/** Mailing address + date of birth, captured once, used on every letter. */
function Letterhead({ head, onSaved }) {
  const [f, setF] = useState({ line1: head.address?.line1 ?? '', line2: head.address?.line2 ?? '', city: head.address?.city ?? '', state: head.address?.state ?? '', zip: head.address?.zip ?? '', dateOfBirth: head.dob ? String(head.dob).slice(0, 10) : '' });
  const [error, setError] = useState(null); const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function save(e) {
    e.preventDefault(); setBusy(true); setError(null);
    try { await creditApi.setLetterhead(f); onSaved(); } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  return (
    <form className="card hl" onSubmit={save}>
      <div className="n">Your mailing address and date of birth</div>
      <div className="s" style={{ marginBottom: 10 }}>The bureaus match your letter to your file with these. Used on every letter; never shared anywhere else.</div>
      <div className="field"><label>Street</label><input value={f.line1} onChange={set('line1')} required autoComplete="address-line1" /></div>
      <div className="field"><label>Apt or unit (optional)</label><input value={f.line2} onChange={set('line2')} autoComplete="address-line2" /></div>
      <div className="mrow" style={{ gridTemplateColumns: '2fr 1fr 1.2fr' }}>
        <div className="field"><label>City</label><input value={f.city} onChange={set('city')} required autoComplete="address-level2" /></div>
        <div className="field"><label>State</label><input value={f.state} onChange={set('state')} maxLength={2} required autoComplete="address-level1" /></div>
        <div className="field"><label>ZIP</label><input value={f.zip} onChange={set('zip')} inputMode="numeric" required autoComplete="postal-code" /></div>
      </div>
      <div className="field"><label>Date of birth</label><input type="date" value={f.dateOfBirth} onChange={set('dateOfBirth')} required /></div>
      {error && <div className="error">{error}</div>}
      <button type="submit" className="btn" disabled={busy}>{busy ? 'Saving…' : 'Save and update my letters'}</button>
    </form>
  );
}

export default function DisputeCase() {
  const { id } = useParams();
  const [c, setC] = useState(null);
  const [error, setError] = useState(null);
  const [outcome, setOutcome] = useState(null);
  const [note, setNote] = useState('');
  const [addr, setAddr] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => creditApi.getCase(id).then(setC).catch((e) => setError(e.message));
  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function act(fn) { setBusy(true); setError(null); try { setC(await fn()); } catch (e) { setError(e.message); } finally { setBusy(false); } }

  if (error && !c) return <div className="content"><div className="error">{error}</div></div>;
  if (!c) return <div className="loading">Loading…</div>;
  const { dispute: d, letters, events, next, letterhead } = c;
  const open = ['draft', 'filed', 'investigating'].includes(d.status);
  const sentAny = letters.some((l) => l.status === 'sent');
  const canRecord = open && sentAny && !['review', 'send'].includes(next.code);
  const rounds = [...new Set(letters.map((l) => l.round))];

  return (
    <div className="content">
      <ScreenTop title={d.item.creditor} sub={`${d.reasonLabel} · round ${d.round}`} right={<span className={`badge status-${d.status}`}>{d.status === 'resolved' ? d.outcome : d.status}</span>} />

      <div className={`card ${next.code === 'closed' ? 'gl' : 'hl'}`}>
        <div className="s" style={{ color: 'var(--orange-dark)', fontWeight: 700 }}>{COUNSELOR.name} says</div>
        <div className="n" style={{ fontSize: 16 }}>{next.title}</div>
        <div className="s" style={{ lineHeight: 1.5, marginTop: 4 }}>{next.text}</div>
        {next.letterId && <Link to={`/credit/letters/${next.letterId}`} className="btn" style={{ marginTop: 10 }}>{next.code === 'review' ? 'Review the letter' : next.code === 'proof' ? 'Add the proof' : 'Open the letter'}</Link>}
        {d.dueAt && open && <div className="s" style={{ marginTop: 8 }}>Answer expected by {fmt(d.dueAt)} · day {d.dayCount}</div>}
      </div>

      {next.code === 'letterhead' && <Letterhead head={letterhead} onSaved={load} />}

      {canRecord && (
        <div className="card">
          <div className="n">What did they say?</div>
          <div className="s" style={{ marginBottom: 8 }}>Check the letter or email they sent, or log in to the bureau and read the dispute result.</div>
          {[['deleted', 'They removed it'], ['updated', 'They corrected it'], ['verified', 'They said it is verified (no change)'], ['no_response', 'No answer and the time is up']].map(([k, l]) => (
            <button type="button" key={k} className={`opt ${outcome === k ? 'sel' : ''}`} onClick={() => setOutcome(k)}><span className="n">{l}</span>{outcome === k && <span className="dot-sel" />}</button>
          ))}
          <div className="field"><textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Date on their letter, anything they said (optional)" maxLength={1000} /></div>
          <button type="button" className="btn" disabled={!outcome || busy} onClick={() => act(() => creditApi.recordOutcome(id, { outcome, note: note || undefined }))}>Record their answer</button>
        </div>
      )}

      {next.code === 'escalate' && (
        <div className="card">
          <div className="n">Next moves. {COUNSELOR.name} drafts, you send.</div>
          {d.outcome === 'verified' && (
            <>
              <button type="button" className="btn" disabled={busy} onClick={() => act(() => creditApi.nextRound(id, { kind: 'mov_request' }))}>Ask how they verified it</button>
              <div className="s" style={{ margin: '4px 0 10px' }}>The bureau owes you the method and the furnisher's contact within 15 days.</div>
              <div className="field"><label>Creditor's dispute address (from your statement or their site)</label><textarea rows={3} value={addr} onChange={(e) => setAddr(e.target.value)} placeholder={`${d.item.creditor}\nAttn: Credit Reporting Disputes\nStreet, City, ST ZIP`} /></div>
              <button type="button" className="btn ghost" disabled={busy} onClick={() => act(() => creditApi.nextRound(id, { kind: 'furnisher_direct', recipientAddress: addr || undefined }))}>Dispute directly with the creditor</button>
              {/collection/i.test(d.item.type ?? '') && <button type="button" className="btn ghost" disabled={busy} onClick={() => act(() => creditApi.nextRound(id, { kind: 'debt_validation', recipientAddress: addr || undefined }))}>Ask the collector to validate the debt</button>}
            </>
          )}
          <button type="button" className={`btn ${d.outcome === 'verified' ? 'ghost' : ''}`} disabled={busy} onClick={() => act(() => creditApi.nextRound(id, { kind: 'cfpb_complaint' }))}>File a complaint with the CFPB</button>
        </div>
      )}

      <div className="lbl">Letters</div>
      {rounds.map((r) => (
        <div className="card list" key={r}>
          {rounds.length > 1 && <div className="s" style={{ fontWeight: 700, marginBottom: 6 }}>Round {r}</div>}
          {letters.filter((l) => l.round === r).map((l) => (
            <Link to={`/credit/letters/${l.id}`} className="row" key={l.id} style={{ textDecoration: 'none', color: 'inherit' }}>
              <div className="grow"><div className="n">{KIND[l.kind]} · {l.recipient_name}</div><div className="s">{l.status === 'sent' ? `Sent ${fmt(l.sent_at)} ${l.sent_method === 'mail_service' ? 'for you, certified' : `by ${String(l.sent_method).replace('_', ' ')}`}${l.tracking ? ` · ${l.tracking}` : ''}` : l.status === 'approved' ? `Signed ${fmt(l.approved_at)}` : 'Draft'}{l.status === 'sent' && <> · {l.proofsMissing?.length ? <span style={{ color: 'var(--orange)', fontWeight: 600 }}>proof needed</span> : <span style={{ color: 'var(--green-ink)', fontWeight: 600 }}>proof on file{l.mail_status === 'delivered' ? ', delivered' : ''}</span>}</>}</div></div>
              <span className={`pill ${STATUS[l.status][1]}`}>{STATUS[l.status][0]}</span>
            </Link>
          ))}
        </div>
      ))}

      <div className="lbl">Timeline</div>
      <div className="card list timeline">
        {events.map((e) => (
          <div className="row" key={e.id}><span className={`dot ${e.kind === 'response' || e.kind === 'letter_sent' || e.kind === 'proof_added' || e.kind === 'mail_status' ? 'g' : ''}`} /><div className="grow"><div className="s" style={{ color: 'var(--ink)' }}>{e.text}</div><div className="s">{new Date(e.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</div></div></div>
        ))}
      </div>

      {open && <button type="button" className="btn secondary" disabled={busy} onClick={() => act(async () => { await creditApi.withdraw(id); return creditApi.getCase(id); })}>Withdraw this dispute</button>}
      {error && <div className="error">{error}</div>}
      <p className="s" style={{ textAlign: 'center', marginTop: 10 }}>{c.counselor.disclosure} Every letter is yours; you decide what to send. No result is promised.</p>
    </div>
  );
}
