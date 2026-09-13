import './setup.js';
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { healthcheck, closePool } from '../src/db/pool.js';
import { REASONS, BUREAUS, bureauDispute, movRequest, furnisherDirect, debtValidation, cfpbComplaint } from '../src/credit/letters.js';
import { nextStep, mailConsentText } from '../src/services/dispute.service.js';
import { renderLetterPdf } from '../src/credit/letterPdf.js';
import { pool } from '../src/db/pool.js';

// DIY dispute workflow: Maren drafts, the member signs and sends, the system never files.

let server; let base; let dbUp = false;
before(async () => {
  try { dbUp = await Promise.race([healthcheck(), new Promise((r) => setTimeout(() => r(false), 2000))]); } catch { dbUp = false; }
  if (!dbUp) return;
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { if (server) await new Promise((r) => server.close(r)); await closePool(); });

const call = (method, path, body, token) => fetch(`${base}${path}`, {
  method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
  body: body === undefined ? undefined : JSON.stringify(body),
});
const uniq = (p) => `${p}_${process.pid}_${Math.floor(Math.random() * 1e9)}@example.test`;

test('pure: every letter template passes the copy gate and carries the statute', () => {
  const member = { name: 'Jo Path', address: { line1: '1 Main St', city: 'Raleigh', state: 'NC', zip: '27601' }, dob: '1990-04-02' };
  const item = { creditor: 'Metro Retail', type: 'revolving', balance: 940 };
  for (const code of Object.keys(REASONS)) {
    for (const b of Object.keys(BUREAUS)) {
      const l = bureauDispute({ member, item, reasonCode: code, details: 'Extra detail.', bureauKey: b });
      assert.match(l.body, /1681i/); assert.match(l.body, /Metro Retail/); assert.match(l.body, /Jo Path/); assert.match(l.body, /Raleigh, NC 27601/);
      assert.equal(l.recipientAddr, BUREAUS[b].address);
      assert.doesNotMatch(l.body, /\bAI\b/);
    }
  }
  assert.match(movRequest({ member, item, bureauKey: 'equifax', priorSentAt: '2026-08-01' }).body, /1681i\(a\)\(7\)/);
  assert.match(furnisherDirect({ member, item, reasonCode: 'wrong_balance' }).body, /1681s-2\(a\)\(8\)/);
  assert.match(debtValidation({ member, item }).body, /1692g/);
  assert.match(cfpbComplaint({ member, item, bureauKey: 'experian', history: ['Aug 1: sent'] }).body, /Experian/);
  // Missing letterhead leaves fill-in brackets rather than inventing data.
  assert.match(bureauDispute({ member: { name: 'Jo' }, item, reasonCode: 'other', bureauKey: 'experian' }).body, /\[your street address\]/);
});

test('pure: next step follows the state machine', () => {
  const head = { complete: true };
  const d = { status: 'draft', round: 1 };
  assert.equal(nextStep(d, [{ round: 1, status: 'draft' }], head).code, 'review');
  assert.equal(nextStep(d, [{ round: 1, status: 'draft' }], { complete: false }).code, 'letterhead');
  assert.equal(nextStep(d, [{ round: 1, status: 'approved' }], head).code, 'send');
  assert.equal(nextStep({ status: 'filed', round: 1, due_at: '2999-01-01' }, [{ round: 1, status: 'sent', sent_method: 'online' }], head).code, 'wait');
  // Fresh certified send without photos of the receipt: ask for the proof first.
  assert.equal(nextStep({ status: 'filed', round: 1, due_at: '2999-01-01', filed_at: new Date().toISOString() }, [{ round: 1, status: 'sent', sent_method: 'certified_mail', proofs: [] }], head).code, 'proof');
  assert.equal(nextStep({ status: 'filed', round: 1, due_at: '2999-01-01', filed_at: new Date().toISOString() }, [{ round: 1, status: 'sent', sent_method: 'certified_mail', proofs: [{ kind: 'signed_letter' }, { kind: 'certified_receipt' }] }], head).code, 'wait');
  assert.equal(nextStep({ status: 'filed', round: 1, due_at: '2999-01-01', filed_at: new Date().toISOString() }, [{ round: 1, status: 'sent', sent_method: 'mail_service', proofs: [{ kind: 'signed_letter', source: 'system' }] }], head).code, 'wait');
  assert.equal(nextStep({ status: 'filed', round: 1, due_at: '2000-01-01' }, [{ round: 1, status: 'sent' }], head).code, 'overdue');
  assert.equal(nextStep({ status: 'investigating', round: 1, outcome: 'verified' }, [{ round: 1, status: 'sent' }], head).code, 'escalate');
  assert.equal(nextStep({ status: 'resolved', outcome: 'deleted', round: 1 }, [], head).code, 'closed');
});

test('api: start -> letterhead -> sign -> sent -> verified -> MOV + furnisher round -> deleted', async (t) => {
  if (!dbUp) return t.skip('db not reachable');
  const r = await call('POST', '/api/auth/register', { name: 'Dee Dispute', email: uniq('dee'), phone: '5551234567', password: 'a-strong-password', consent: { terms: true, dataNeverSold: true } });
  const tok = (await r.json()).accessToken;
  await call('POST', '/api/intake', { householdIncome: 58000, targetArea: 'Raleigh, NC', authorizeCreditPull: true }, tok);
  assert.equal((await call('POST', '/api/credit/pull', undefined, tok)).status, 201);
  const ov = await (await call('GET', '/api/credit', undefined, tok)).json();
  const target = ov.disputable[0];
  const accurate = ov.accurate[0];

  const opts = await (await call('GET', '/api/credit/dispute-options', undefined, tok)).json();
  assert.ok(opts.reasons.length >= 8 && opts.bureaus.length === 3);
  assert.equal(opts.letterhead.complete, false);

  assert.equal((await call('POST', `/api/credit/items/${accurate.id}/dispute`, { reasonCode: 'wrong_balance' }, tok)).status, 403, 'accurate items stay off limits');
  assert.equal((await call('POST', `/api/credit/items/${target.id}/dispute`, { reasonCode: 'nope' }, tok)).status, 422);

  let c = await call('POST', `/api/credit/items/${target.id}/dispute`, { reasonCode: 'not_mine', details: 'I have never had an account here.', bureaus: ['experian', 'equifax'] }, tok);
  assert.equal(c.status, 201);
  c = await c.json();
  assert.equal(c.dispute.status, 'draft');
  assert.equal(c.letters.length, 2);
  assert.equal(c.next.code, 'letterhead');
  assert.equal((await call('POST', `/api/credit/items/${target.id}/dispute`, { reasonCode: 'not_mine' }, tok)).status, 409, 'one open case per item');
  const [l1, l2] = c.letters;
  assert.equal((await call('POST', `/api/credit/letters/${l1.id}/sign`, { signedName: 'Dee Dispute' }, tok)).status, 422, 'no letterhead, no signature');

  assert.equal((await call('PUT', '/api/credit/letterhead', { line1: '12 Oak St', city: 'Durham', state: 'nc', zip: '27701', dateOfBirth: '1988-02-14' }, tok)).status, 200);
  c = await (await call('GET', `/api/credit/cases/${c.dispute.id}`, undefined, tok)).json();
  assert.equal(c.next.code, 'review');
  assert.match(c.letters[0].body, /12 Oak St/, 'drafts pick up the letterhead');
  assert.match(c.letters[0].body, /02\/14\/1988/);

  // Edit, sign, and the letter can't be marked sent before it's signed.
  const edited = await call('PUT', `/api/credit/letters/${l1.id}`, { body: c.letters[0].body.replace('I have never had an account here.', 'I have never had an account with this company.') }, tok);
  assert.equal(edited.status, 200);
  assert.equal((await call('POST', `/api/credit/letters/${l1.id}/sent`, { method: 'certified_mail' }, tok)).status, 409);
  c = await (await call('POST', `/api/credit/letters/${l1.id}/sign`, { signedName: 'Dee Dispute' }, tok)).json();
  assert.equal(c.letters[0].status, 'approved'); assert.equal(c.next.code, 'review', 'second letter still a draft');
  await call('POST', `/api/credit/letters/${l2.id}/sign`, { signedName: 'Dee Dispute' }, tok);
  c = await (await call('POST', `/api/credit/letters/${l1.id}/sent`, { method: 'certified_mail', tracking: '9407 1111 2222', sentOn: '2026-07-01' }, tok)).json();
  assert.equal(c.dispute.status, 'filed');
  assert.equal(c.dispute.dueAt.slice(0, 10), '2026-08-05', '30 days + 5 mail days');
  c = await (await call('POST', `/api/credit/letters/${l2.id}/sent`, { method: 'online', sentOn: '2026-07-02' }, tok)).json();
  assert.equal(c.dispute.dueAt.slice(0, 10), '2026-08-05', 'a later online send (shorter wait) never shortens the clock');
  assert.equal((await call('PUT', `/api/credit/letters/${l1.id}`, { body: 'x'.repeat(100) }, tok)).status, 409, 'sent letters are frozen');
  assert.equal(c.next.code, 'overdue', 'clock ran out in test time');
  assert.ok(c.dispute.dayCount > 60, 'day count runs from the send date');

  // Escalation path.
  assert.equal((await call('POST', `/api/credit/cases/${c.dispute.id}/next`, { kind: 'mov_request' }, tok)).status, 409, 'MOV needs a verified answer first');
  c = await (await call('POST', `/api/credit/cases/${c.dispute.id}/outcome`, { outcome: 'verified', note: 'Letter dated Sep 20.' }, tok)).json();
  assert.equal(c.next.code, 'escalate');
  c = await (await call('POST', `/api/credit/cases/${c.dispute.id}/next`, { kind: 'mov_request' }, tok)).json();
  assert.equal(c.dispute.round, 2);
  assert.equal(c.letters.filter((l) => l.kind === 'mov_request').length, 2);
  c = await (await call('POST', `/api/credit/cases/${c.dispute.id}/next`, { kind: 'furnisher_direct', recipientAddress: 'Metro Retail\n1 Retail Way\nAustin, TX 73301' }, tok)).json();
  assert.equal(c.dispute.round, 3);
  assert.match(c.letters.find((l) => l.kind === 'furnisher_direct').body, /1 Retail Way/);
  assert.equal(c.next.code, 'review');

  c = await (await call('POST', `/api/credit/cases/${c.dispute.id}/outcome`, { outcome: 'deleted' }, tok)).json();
  assert.equal(c.dispute.status, 'resolved'); assert.equal(c.next.code, 'closed');
  assert.ok(c.events.length >= 6, 'timeline recorded');

  const list = await (await call('GET', '/api/credit/cases', undefined, tok)).json();
  assert.equal(list.cases.length, 1); assert.equal(list.cases[0].outcome, 'deleted');
  const legacy = await (await call('GET', '/api/credit/disputes', undefined, tok)).json();
  assert.ok(legacy.disputes.some((d) => d.id === c.dispute.id));
});

test('pure: mail consent names the price as pass-through and the member as author; PDF renders', async () => {
  const t = mailConsentText({ amountCents: 1069, recipientName: 'Experian' });
  assert.match(t, /\$10\.69/); assert.match(t, /no markup/); assert.match(t, /I wrote and approved this letter/); assert.doesNotMatch(t, /\bAI\b/);
  const { pdf, pages } = await renderLetterPdf({ body: 'Dear Experian,\n\nPlease investigate.', signedName: 'Jo Path', signedAt: new Date() });
  assert.equal(pdf.subarray(0, 4).toString(), '%PDF'); assert.equal(pages, 1);
});

test('api: mail it for me is off by default, charges at cost when on, files the copy; self-mail proofs attach', async (t) => {
  if (!dbUp) return t.skip('no database reachable');
  const reg = await call('POST', '/api/auth/register', { name: 'Mail Path', email: uniq('mail'), phone: '5550001234', password: 'a-strong-password', consent: { terms: true, dataNeverSold: true } });
  const { accessToken: tok } = await reg.json();
  const memberToken = tok;
  assert.equal((await call('POST', '/api/credit/pull', undefined, memberToken)).status, 201);
  const ov = await (await call('GET', '/api/credit', undefined, memberToken)).json();
  await call('PUT', '/api/credit/letterhead', { line1: '12 Oak St', city: 'Raleigh', state: 'NC', zip: '27601', dateOfBirth: '1988-02-14' }, memberToken);
  const started = await (await call('POST', `/api/credit/items/${ov.disputable[0].id}/dispute`, { reasonCode: 'not_mine', bureaus: ['experian', 'equifax'] }, memberToken)).json();
  const [l1, l2] = started.letters;
  await call('POST', `/api/credit/letters/${l1.id}/sign`, { signedName: 'Mail Path' }, memberToken);
  await call('POST', `/api/credit/letters/${l2.id}/sign`, { signedName: 'Mail Path' }, memberToken);

  // Switch off: quote says so, mailing refused.
  await pool.query(`UPDATE billing_settings SET value = value || '{"enabled": false}' WHERE key = 'mail_service'`);
  let q = await (await call('GET', `/api/credit/letters/${l1.id}/mail-quote`, undefined, memberToken)).json();
  assert.equal(q.canMail, false); assert.ok(q.amountCents > 900, 'certified with ERR is around ten dollars');
  assert.equal((await call('POST', `/api/credit/letters/${l1.id}/mail`, { consentAccepted: true, paymentMethodToken: 'pm_mock_4242' }, memberToken)).status, 409);

  // Switch on: consent required, then charged at the quoted price and marked sent with a system copy on file.
  await pool.query(`UPDATE billing_settings SET value = value || '{"enabled": true}' WHERE key = 'mail_service'`);
  try {
    q = await (await call('GET', `/api/credit/letters/${l1.id}/mail-quote`, undefined, memberToken)).json();
    assert.equal(q.canMail, true);
    assert.equal((await call('POST', `/api/credit/letters/${l1.id}/mail`, { consentAccepted: false, paymentMethodToken: 'pm_mock_4242' }, memberToken)).status, 422);
    assert.equal((await call('POST', `/api/credit/letters/${l1.id}/mail`, { consentAccepted: true, paymentMethodToken: 'pm_mock_declined' }, memberToken)).status, 422);
    const r = await call('POST', `/api/credit/letters/${l1.id}/mail`, { consentAccepted: true, paymentMethodToken: 'pm_mock_4242' }, memberToken);
    assert.equal(r.status, 200);
    const c = await r.json();
    const m = c.letters.find((x) => x.id === l1.id);
    assert.equal(m.status, 'sent'); assert.equal(m.sent_method, 'mail_service'); assert.equal(m.mail_provider, 'mock'); assert.equal(m.mail_cost_cents, q.amountCents);
    assert.ok(m.tracking, 'tracking number recorded');
    assert.deepEqual(m.proofs.map((p) => [p.kind, p.source]), [['signed_letter', 'system']]);
    assert.deepEqual(m.proofsMissing, []);
    assert.equal(c.dispute.status, 'filed');
    const { rows: pay } = await pool.query(`SELECT kind, amount_cents, status FROM payments WHERE id = (SELECT payment_id FROM dispute_letters WHERE id = $1)`, [l1.id]);
    assert.deepEqual(pay[0], { kind: 'mail', amount_cents: q.amountCents, status: 'succeeded' });
    assert.equal((await call('POST', `/api/credit/letters/${l1.id}/mail`, { consentAccepted: true }, memberToken)).status, 409, 'cannot mail twice');

    // Provider says delivered: status and event land on the letter.
    const wh = await fetch(`${base}/api/credit/mail-webhook`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ref: m.mail_ref ?? `mail_mock_${l1.id.slice(0, 8)}`, status: 'delivered', deliveredAt: new Date().toISOString() }) });
    assert.equal(wh.status, 200);
    const c2 = await (await call('GET', `/api/credit/cases/${c.dispute.id}`, undefined, memberToken)).json();
    assert.equal(c2.letters.find((x) => x.id === l1.id).mail_status, 'delivered');
    assert.ok(c2.events.some((e) => e.kind === 'mail_status' && /delivered/.test(e.text)));
  } finally {
    await pool.query(`UPDATE billing_settings SET value = value || '{"enabled": false}' WHERE key = 'mail_service'`);
  }

  // Self-mailed certified: proof is owed until the member photographs the letter and the receipt.
  assert.equal((await call('POST', `/api/credit/letters/${l2.id}/proofs`, { kind: 'signed_letter', mimeType: 'image/jpeg', dataBase64: Buffer.from('jpegbytes').toString('base64') }, memberToken)).status, 409, 'not sent yet');
  let c3 = await (await call('POST', `/api/credit/letters/${l2.id}/sent`, { method: 'certified_mail', tracking: '9407 1111 2222 3333 4444 55' }, memberToken)).json();
  let s2 = c3.letters.find((x) => x.id === l2.id);
  assert.deepEqual(s2.proofsMissing, ['signed_letter', 'certified_receipt']);
  assert.equal(c3.next.code, 'proof');
  assert.equal((await call('POST', `/api/credit/letters/${l2.id}/proofs`, { kind: 'nope', mimeType: 'image/jpeg', dataBase64: 'aGk=' }, memberToken)).status, 422);
  c3 = await (await call('POST', `/api/credit/letters/${l2.id}/proofs`, { kind: 'signed_letter', fileName: 'letter.jpg', mimeType: 'image/jpeg', dataBase64: Buffer.from('jpegbytes').toString('base64') }, memberToken)).json();
  c3 = await (await call('POST', `/api/credit/letters/${l2.id}/proofs`, { kind: 'certified_receipt', fileName: 'receipt.jpg', mimeType: 'image/jpeg', dataBase64: Buffer.from('jpegbytes').toString('base64') }, memberToken)).json();
  s2 = c3.letters.find((x) => x.id === l2.id);
  assert.deepEqual(s2.proofsMissing, []);
  assert.equal(s2.proofs.length, 2);
  assert.equal(c3.next.code, 'wait');
  const { rows: docs } = await pool.query(`SELECT doc_type FROM member_documents WHERE id = ANY($1::uuid[]) ORDER BY doc_type`, [s2.proofs.map((p) => p.documentId)]);
  assert.deepEqual(docs.map((d) => d.doc_type), ['mail_proof', 'mail_proof']);
});
