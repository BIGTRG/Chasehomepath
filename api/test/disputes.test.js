import './setup.js';
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { healthcheck, closePool } from '../src/db/pool.js';
import { REASONS, BUREAUS, bureauDispute, movRequest, furnisherDirect, debtValidation, cfpbComplaint } from '../src/credit/letters.js';
import { nextStep } from '../src/services/dispute.service.js';

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
  assert.equal(nextStep({ status: 'filed', round: 1, due_at: '2999-01-01' }, [{ round: 1, status: 'sent' }], head).code, 'wait');
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
