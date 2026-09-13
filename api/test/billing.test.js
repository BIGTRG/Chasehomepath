import './setup.js';
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { pool, healthcheck, closePool } from '../src/db/pool.js';
import { hashPassword } from '../src/auth/password.js';
import { consentText, sessionSlots } from '../src/services/billing.service.js';
import { createMockPaymentAdapter } from '../src/integrations/payments/mock.js';

// Billing: monthly plans, cancel anytime, $89 sessions. DB-backed tests self-skip
// without Postgres (same convention as integration.test.js).

let server;
let base;
let dbUp = false;

before(async () => {
  try {
    dbUp = await Promise.race([healthcheck(), new Promise((r) => setTimeout(() => r(false), 2000))]);
  } catch {
    dbUp = false;
  }
  if (!dbUp) return;
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  if (server) await new Promise((r) => server.close(r));
  await closePool();
});

const call = (method, path, body, token) =>
  fetch(`${base}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const uniq = (p) => `${p}_${process.pid}_${Math.floor(Math.random() * 1e9)}@example.test`;

async function newMember() {
  const r = await call('POST', '/api/auth/register', {
    name: 'Bill Payer', email: uniq('bill'), phone: '5551234567', password: 'a-strong-password',
    consent: { terms: true, dataNeverSold: true },
  });
  assert.equal(r.status, 201);
  return (await r.json()).accessToken;
}

async function newStaff(role) {
  const email = uniq(role);
  const hash = await hashPassword('a-strong-password');
  const { rows } = await pool.query(
    `INSERT INTO users (email, phone, password_hash, role, status, mfa_enabled) VALUES ($1,'5550000000',$2,$3,'active',false) RETURNING id`,
    [email, hash, role],
  );
  const login = await call('POST', '/api/auth/login', { email, password: 'a-strong-password' });
  return { id: rows[0].id, token: (await login.json()).accessToken };
}

// ── Pure units ──

test('consent text states price, monthly renewal, one-tap cancel, and not-credit-repair', () => {
  const t = consentText({ planName: 'Express', priceCents: 24900 });
  assert.match(t, /\$249 per month/);
  assert.match(t, /renews automatically/);
  assert.match(t, /cancel anytime/i);
  assert.match(t, /not credit repair/);
});

test('session slots are future weekday times', () => {
  const slots = sessionSlots(new Date('2026-09-11T12:00:00Z'), 10); // a Friday
  assert.equal(slots.length, 10);
  for (const s of slots) {
    const d = new Date(s);
    assert.ok(d > new Date('2026-09-11T12:00:00Z'));
    assert.ok(d.getDay() !== 0 && d.getDay() !== 6);
  }
});

test('mock processor: declined token fails subscription and charge; refund works', async () => {
  const p = createMockPaymentAdapter();
  const { customerId } = await p.createCustomer({ email: 'x@example.test' });
  const bad = await p.attachPaymentMethod({ customerId, paymentMethodToken: 'pm_mock_declined' });
  assert.equal((await p.createSubscription({ customerId, paymentMethodId: bad.paymentMethodId, priceCents: 100 })).status, 'failed');
  assert.equal((await p.charge({ customerId, paymentMethodId: bad.paymentMethodId, amountCents: 100 })).status, 'failed');
  const good = await p.attachPaymentMethod({ customerId, paymentMethodToken: 'pm_mock_4242' });
  assert.equal(good.label, 'Card ending 4242');
  const ch = await p.charge({ customerId, paymentMethodId: good.paymentMethodId, amountCents: 8900 });
  assert.equal(ch.status, 'succeeded');
  assert.equal((await p.refund({ chargeRef: ch.chargeRef, amountCents: 8900 })).status, 'refunded');
  await assert.rejects(() => p.attachPaymentMethod({ customerId, paymentMethodToken: 'tok_garbage' }));
});

// ── HTTP without DB ──

test('plans catalog is public; member billing routes need auth', async (t) => {
  if (!dbUp) return t.skip('no database reachable');
  const r = await call('GET', '/api/billing/plans');
  assert.equal(r.status, 200);
  const { plans, session } = await r.json();
  assert.deepEqual(plans.map((p) => [p.code, p.priceCents, p.targetMonths]), [['steady', 14900, 12], ['focused', 18900, 9], ['express', 24900, 6]]);
  assert.equal(session.priceCents, 8900);
  assert.equal(session.durationMin, 45);
  // Nothing bundled: no plan lists an included session.
  for (const p of plans) assert.ok(!p.features.some((f) => /included/i.test(f)), `${p.code} bundles a session`);
  assert.equal((await call('GET', '/api/billing/me')).status, 401);
});

// ── DB-backed flows ──

test('subscribe -> overview -> cancel -> resume; double subscribe is a conflict', async (t) => {
  if (!dbUp) return t.skip('no database reachable');
  const token = await newMember();

  const noConsent = await call('POST', '/api/billing/subscribe', { planCode: 'focused', paymentMethodToken: 'pm_mock_4242', consentAccepted: false }, token);
  assert.equal(noConsent.status, 422);

  const sub = await call('POST', '/api/billing/subscribe', { planCode: 'focused', paymentMethodToken: 'pm_mock_4242', consentAccepted: true }, token);
  assert.equal(sub.status, 201);
  const { subscription } = await sub.json();
  assert.equal(subscription.planCode, 'focused');
  assert.equal(subscription.priceCents, 18900);
  assert.equal(subscription.status, 'active');
  assert.equal(subscription.paymentMethod, 'Card ending 4242');
  assert.ok(new Date(subscription.currentPeriodEnd) > new Date());

  const dup = await call('POST', '/api/billing/subscribe', { planCode: 'express', paymentMethodToken: 'pm_mock_4242', consentAccepted: true }, token);
  assert.equal(dup.status, 409);

  const me = await (await call('GET', '/api/billing/me', undefined, token)).json();
  assert.equal(me.subscription.id, subscription.id);
  assert.equal(me.payments.length, 1);
  assert.equal(me.payments[0].amountCents, 18900);
  assert.equal(me.payments[0].status, 'succeeded');

  // Tier follows the plan.
  const { rows } = await pool.query(`SELECT membership_tier FROM members WHERE id = (SELECT member_id FROM subscriptions WHERE id = $1)`, [subscription.id]);
  assert.equal(rows[0].membership_tier, 2);

  // Consent is stored verbatim (negative-option rule).
  const { rows: c } = await pool.query(`SELECT consent_text, consent_terms_version FROM subscriptions WHERE id = $1`, [subscription.id]);
  assert.match(c[0].consent_text, /\$189 per month/);
  assert.ok(c[0].consent_terms_version);

  const change = await (await call('POST', '/api/billing/change-plan', { planCode: 'express' }, token)).json();
  assert.equal(change.subscription.planCode, 'express');
  assert.equal(change.subscription.priceCents, 24900);

  const cancel = await (await call('POST', '/api/billing/cancel', undefined, token)).json();
  assert.equal(cancel.subscription.cancelAtPeriodEnd, true);
  assert.equal(cancel.subscription.status, 'active'); // access through the paid month

  const resume = await (await call('POST', '/api/billing/resume', undefined, token)).json();
  assert.equal(resume.subscription.cancelAtPeriodEnd, false);
});

test('declined card: no subscription created, failed payment recorded', async (t) => {
  if (!dbUp) return t.skip('no database reachable');
  const token = await newMember();
  const r = await call('POST', '/api/billing/subscribe', { planCode: 'steady', paymentMethodToken: 'pm_mock_declined', consentAccepted: true }, token);
  assert.equal(r.status, 422);
  assert.equal((await r.json()).error.details.code, 'card_declined');
  const me = await (await call('GET', '/api/billing/me', undefined, token)).json();
  assert.equal(me.subscription, null);
  assert.equal(me.payments[0].status, 'failed');
});

test('book a $89 session on any tier, cancel 24h+ ahead refunds', async (t) => {
  if (!dbUp) return t.skip('no database reachable');
  await newStaff('specialist'); // ensures a counselor exists
  const token = await newMember();
  await call('POST', '/api/billing/subscribe', { planCode: 'express', paymentMethodToken: 'pm_mock_4242', consentAccepted: true }, token);

  const { slots, session } = await (await call('GET', '/api/billing/sessions/slots', undefined, token)).json();
  assert.ok(slots.length >= 5);
  assert.equal(session.priceCents, 8900);

  // Express does NOT include sessions: the booking is charged.
  const far = slots[slots.length - 1];
  const book = await call('POST', '/api/billing/sessions', { type: 'video', scheduledAt: far, topic: 'Budget review' }, token);
  assert.equal(book.status, 201);
  const booked = (await book.json()).session;
  assert.equal(booked.priceCents, 8900);
  assert.equal(booked.durationMin, 45);
  assert.equal(booked.status, 'booked');

  let me = await (await call('GET', '/api/billing/me', undefined, token)).json();
  assert.equal(me.sessions.length, 1);
  assert.equal(me.payments.filter((p) => p.kind === 'session' && p.status === 'succeeded').length, 1);

  const cancel = await (await call('POST', `/api/billing/sessions/${booked.id}/cancel`, undefined, token)).json();
  assert.equal(cancel.session.refunded, true);
  assert.equal(cancel.session.status, 'refunded');
  me = await (await call('GET', '/api/billing/me', undefined, token)).json();
  assert.equal(me.payments.find((p) => p.kind === 'session').status, 'refunded');

  const past = await call('POST', '/api/billing/sessions', { type: 'video', scheduledAt: '2020-01-01T10:00:00Z' }, token);
  assert.equal(past.status, 422);
});

test('session without a plan requires a payment token and still books', async (t) => {
  if (!dbUp) return t.skip('no database reachable');
  await newStaff('specialist');
  const token = await newMember();
  const { slots } = await (await call('GET', '/api/billing/sessions/slots', undefined, token)).json();
  const noToken = await call('POST', '/api/billing/sessions', { type: 'call', scheduledAt: slots[0] }, token);
  assert.equal(noToken.status, 422);
  const ok = await call('POST', '/api/billing/sessions', { type: 'call', scheduledAt: slots[0], paymentMethodToken: 'pm_mock_1111' }, token);
  assert.equal(ok.status, 201);
});

test('mock webhook: invoice.paid renews, payment_failed marks past_due, deleted cancels', async (t) => {
  if (!dbUp) return t.skip('no database reachable');
  const token = await newMember();
  const { subscription } = await (await call('POST', '/api/billing/subscribe', { planCode: 'steady', paymentMethodToken: 'pm_mock_4242', consentAccepted: true }, token)).json();
  const { rows } = await pool.query(`SELECT processor_subscription_id FROM subscriptions WHERE id = $1`, [subscription.id]);
  const psid = rows[0].processor_subscription_id;
  const send = (id, type, object) => fetch(`${base}/api/billing/webhook`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, type, data: { object } }) });

  const start = Math.floor(Date.now() / 1000) + 86400 * 30;
  assert.equal((await send(`evt_${psid}_1`, 'invoice.paid', { id: `in_${psid}_2`, subscription: psid, amount_paid: 14900, lines: { data: [{ period: { start, end: start + 86400 * 30 } }] } })).status, 200);
  let me = await (await call('GET', '/api/billing/me', undefined, token)).json();
  assert.equal(me.payments.length, 2);
  assert.ok(new Date(me.subscription.currentPeriodEnd) > new Date(Date.now() + 86400 * 45 * 1000));

  // Duplicate event is ignored.
  const dup = await (await send(`evt_${psid}_1`, 'invoice.paid', { id: `in_${psid}_2`, subscription: psid })).json();
  assert.equal(dup.duplicate, true);

  await send(`evt_${psid}_2`, 'invoice.payment_failed', { id: `in_${psid}_3`, subscription: psid, amount_due: 14900 });
  me = await (await call('GET', '/api/billing/me', undefined, token)).json();
  assert.equal(me.subscription.status, 'past_due');

  await send(`evt_${psid}_3`, 'customer.subscription.deleted', { id: psid });
  me = await (await call('GET', '/api/billing/me', undefined, token)).json();
  assert.equal(me.subscription, null);
});

test('operator billing summary: manager sees MRR and plan counts; specialist cannot', async (t) => {
  if (!dbUp) return t.skip('no database reachable');
  const token = await newMember();
  await call('POST', '/api/billing/subscribe', { planCode: 'express', paymentMethodToken: 'pm_mock_4242', consentAccepted: true }, token);
  const manager = await newStaff('manager');
  const r = await call('GET', '/api/billing/operator/summary', undefined, manager.token);
  assert.equal(r.status, 200);
  const s = await r.json();
  const express = s.plans.find((p) => p.code === 'express');
  assert.ok(express.active >= 1);
  assert.ok(s.mrrCents >= 24900);
  assert.ok(s.revenue.monthCents >= 24900);
  const spec = await newStaff('specialist');
  assert.equal((await call('GET', '/api/billing/operator/summary', undefined, spec.token)).status, 403);
});

test('team role editor: manager edits title/capacity/role; cannot grant admin or edit self', async (t) => {
  if (!dbUp) return t.skip('no database reachable');
  const manager = await newStaff('manager');
  const spec = await newStaff('specialist');
  const r = await call('PATCH', `/api/operator/team/${spec.id}`, { title: 'credit_specialist', capacityTarget: 8 }, manager.token);
  assert.equal(r.status, 200);
  const { staff } = await r.json();
  assert.equal(staff.title, 'credit_specialist');
  assert.equal(staff.capacityTarget, 8);
  assert.equal(staff.flag, 'under');

  const promote = await call('PATCH', `/api/operator/team/${spec.id}`, { role: 'manager' }, manager.token);
  assert.equal((await promote.json()).staff.role, 'manager');
  assert.equal((await call('PATCH', `/api/operator/team/${spec.id}`, { role: 'admin' }, manager.token)).status, 403);
  assert.equal((await call('PATCH', `/api/operator/team/${manager.id}`, { role: 'specialist' }, manager.token)).status, 403);

  const cap = await (await call('GET', '/api/operator/capacity', undefined, manager.token)).json();
  const row = cap.capacity.find((c) => c.userId === spec.id);
  assert.equal(row.role, 'manager');
  assert.equal(row.capacityTarget, 8);
});

test('counseling catalog: topics, group placeholder price; staff creates group, member joins, room access works', async (t) => {
  if (!dbUp) return t.skip('no database reachable');
  const pub = await (await call('GET', '/api/billing/counseling')).json();
  assert.ok(pub.topics.some((x) => x.code === 'food_spending'));
  assert.equal(pub.single.priceCents, 8900);
  assert.equal(pub.group.placeholder, true);

  const host = await newStaff('manager');
  const when = new Date(Date.now() + 3 * 864e5).toISOString();
  const created = await call('POST', '/api/billing/operator/group-sessions', { topicCode: 'budget_101', scheduledAt: when, capacity: 2 }, host.token);
  assert.equal(created.status, 201);
  const g = (await created.json()).groupSession;
  assert.equal(g.title, 'Budget 101, with a real person');
  assert.equal(g.priceCents, 4900);

  const token = await newMember();
  const join = await call('POST', `/api/billing/group-sessions/${g.id}/join`, { paymentMethodToken: 'pm_mock_4242' }, token);
  assert.equal(join.status, 201);
  const seat = (await join.json()).session;
  assert.equal(seat.format, 'group');
  assert.equal(seat.roomCode, g.roomCode);
  assert.equal((await call('POST', `/api/billing/group-sessions/${g.id}/join`, { paymentMethodToken: 'pm_mock_4242' }, token)).status, 409);

  const mine = await (await call('GET', '/api/billing/counseling', undefined, token)).json();
  assert.equal(mine.groupSessions.find((x) => x.id === g.id).joined, true);
  assert.equal(mine.groupSessions.find((x) => x.id === g.id).seatsLeft, 1);

  // Room: member and host can see it; a stranger cannot. Not open yet (3 days out).
  const room = await call('GET', `/api/meet/${g.roomCode}`, undefined, token);
  assert.equal(room.status, 200);
  assert.equal((await room.json()).room.open, false);
  assert.equal((await call('GET', `/api/meet/${g.roomCode}`, undefined, host.token)).status, 200);
  const stranger = await newMember();
  assert.equal((await call('GET', `/api/meet/${g.roomCode}`, undefined, stranger)).status, 403);
  assert.equal((await call('GET', '/api/meet/nope', undefined, token)).status, 404);
});

test('plan review: steps come from the member file, ready flips after subscribing', async (t) => {
  if (!dbUp) return t.skip('no database reachable');
  const token = await newMember();
  let r = await (await call('GET', '/api/agent/plan-review', undefined, token)).json();
  assert.equal(r.ready, false);
  assert.ok(r.steps.length >= 8);
  assert.ok(r.steps.some((s) => s.key === 'track:credit'));
  for (const s of r.steps) assert.ok(!/guarantee|will (raise|increase|remove)/i.test(s.say), s.say);
  await call('POST', '/api/billing/subscribe', { planCode: 'express', paymentMethodToken: 'pm_mock_4242', consentAccepted: true }, token);
  r = await (await call('GET', '/api/agent/plan-review', undefined, token)).json();
  assert.equal(r.ready, true);
  assert.equal(r.plan.targetMonths, 6);
  assert.match(r.steps[0].say, /Express pace with a 6-month target/);
});

test('consultation booking returns a room code and the member can open the room', async (t) => {
  if (!dbUp) return t.skip('no database reachable');
  await newStaff('specialist');
  const token = await newMember();
  const { slots } = await (await call('GET', '/api/intake/slots', undefined, token)).json();
  const b = await call('POST', '/api/intake/appointments', { type: 'video', scheduledAt: slots[0] }, token);
  assert.equal(b.status, 201);
  const appt = (await b.json()).appointment;
  assert.ok(appt.room_code || appt.roomCode);
  const code = appt.room_code || appt.roomCode;
  const room = await (await call('GET', `/api/meet/${code}`, undefined, token)).json();
  assert.equal(room.room.title, 'First consultation');
});
