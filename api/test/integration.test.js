import './setup.js';
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { pool, healthcheck, closePool } from '../src/db/pool.js';

// End-to-end tests against a real PostgreSQL. They self-skip when no DB is reachable
// (local runs without Postgres); CI provides the database and runs them for real.

let server;
let base;
let dbUp = false;

before(async () => {
  try {
    dbUp = await Promise.race([
      healthcheck(),
      new Promise((resolve) => setTimeout(() => resolve(false), 2000)),
    ]);
  } catch {
    dbUp = false;
  }
  if (!dbUp) return;
  const app = createApp();
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise((r) => server.close(r));
  await closePool();
});

const post = (path, body, token) =>
  fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });

function uniqueEmail() {
  return `member_${process.pid}_${Math.floor(Math.random() * 1e9)}@example.test`;
}

test('register creates a member with a plan, six tracks, and the 90-day rule', async (t) => {
  if (!dbUp) return t.skip('no database reachable');

  const email = uniqueEmail();
  const reg = await post('/api/auth/register', {
    name: 'Test Member',
    email,
    phone: '5551234567',
    password: 'a-strong-password',
    consent: { terms: true, dataNeverSold: true },
  });
  assert.equal(reg.status, 201);
  const session = await reg.json();
  assert.ok(session.accessToken);
  assert.equal(session.user.role, 'member');

  // Plan home
  const planRes = await fetch(`${base}/api/plan`, {
    headers: { authorization: `Bearer ${session.accessToken}` },
  });
  assert.equal(planRes.status, 200);
  const { plan } = await planRes.json();

  assert.equal(plan.tracks.length, 6);
  assert.deepEqual(
    plan.tracks.map((tr) => tr.track_type).sort(),
    ['budget', 'credit', 'education', 'readiness', 'savings', 'timeline'],
  );
  assert.equal(plan.planDay, 0);
  assert.equal(plan.placement.minDay, 90);
  assert.equal(plan.placement.eligible, false);
  assert.equal(plan.placement.daysRemaining, 90);
  assert.ok(plan.milestones.some((m) => m.due_day === 90));

  // No score field anywhere in the plan payload (score-withheld; credit phase owns score).
  assert.equal(JSON.stringify(plan).toLowerCase().includes('score'), false);

  // Cleanup this test's rows.
  await pool.query(
    `DELETE FROM milestones WHERE plan_id IN (SELECT id FROM plans WHERE member_id IN
       (SELECT id FROM members WHERE user_id = (SELECT id FROM users WHERE email = $1)))`,
    [email],
  );
});

test('registering the same email twice is a 409 conflict', async (t) => {
  if (!dbUp) return t.skip('no database reachable');
  const email = uniqueEmail();
  const body = {
    name: 'Dup', email, password: 'a-strong-password',
    consent: { terms: true, dataNeverSold: true },
  };
  const first = await post('/api/auth/register', body);
  assert.equal(first.status, 201);
  const second = await post('/api/auth/register', body);
  assert.equal(second.status, 409);
});

test('registration without data-never-sold consent is rejected', async (t) => {
  if (!dbUp) return t.skip('no database reachable');
  const res = await post('/api/auth/register', {
    name: 'No Consent',
    email: uniqueEmail(),
    password: 'a-strong-password',
    consent: { terms: true, dataNeverSold: false },
  });
  assert.equal(res.status, 422);
});

test('login round-trips and returns a session', async (t) => {
  if (!dbUp) return t.skip('no database reachable');
  const email = uniqueEmail();
  await post('/api/auth/register', {
    name: 'Login Test', email, password: 'a-strong-password',
    consent: { terms: true, dataNeverSold: true },
  });
  const res = await post('/api/auth/login', { email, password: 'a-strong-password' });
  assert.equal(res.status, 200);
  const session = await res.json();
  assert.ok(session.accessToken && session.refreshToken);
});

async function registerMember() {
  const email = uniqueEmail();
  const reg = await post('/api/auth/register', {
    name: 'Credit Test', email, password: 'a-strong-password',
    consent: { terms: true, dataNeverSold: true },
  });
  return { email, ...(await reg.json()) };
}
const authed = (token) => ({ authorization: `Bearer ${token}` });

test('credit: pull splits disputable/accurate, withholds score, disputes are member-initiated', async (t) => {
  if (!dbUp) return t.skip('no database reachable');
  const { accessToken } = await registerMember();

  // Pull a report (mock bureau).
  const pull = await fetch(`${base}/api/credit/pull`, { method: 'POST', headers: authed(accessToken) });
  assert.equal(pull.status, 201);
  assert.equal((await pull.json()).itemCount, 5);

  // Overview: 3 disputable (mismatch, unrecognized, obsolete), 2 accurate.
  const ov = await (await fetch(`${base}/api/credit`, { headers: authed(accessToken) })).json();
  assert.equal(ov.disputable.length, 3);
  assert.equal(ov.accurate.length, 2);

  // Score is withheld before the first consultation is complete (spec §8).
  assert.equal(ov.score.withheld, true);
  assert.equal(JSON.stringify(ov.score).includes('612'), false);

  // File a dispute on a disputable item (member-initiated click).
  const target = ov.disputable[0];
  const filed = await fetch(`${base}/api/credit/items/${target.id}/dispute`, {
    method: 'POST', headers: { ...authed(accessToken), 'content-type': 'application/json' },
    body: JSON.stringify({ method: 'online' }),
  });
  assert.equal(filed.status, 201);
  const { dispute } = await filed.json();
  assert.equal(dispute.status, 'filed');

  // Filing again on the same item conflicts (one open dispute per item).
  const again = await fetch(`${base}/api/credit/items/${target.id}/dispute`, {
    method: 'POST', headers: { ...authed(accessToken), 'content-type': 'application/json' }, body: '{}',
  });
  assert.equal(again.status, 409);

  // The dispute is traceable to the member in the audit log.
  const { rows: audits } = await pool.query(
    `SELECT actor_user_id FROM audit_log WHERE action = 'dispute.filed' AND entity_id = $1`,
    [dispute.id],
  );
  assert.ok(audits[0] && audits[0].actor_user_id, 'dispute.filed must record the initiating member');

  // Tracker lists it.
  const tracker = await (await fetch(`${base}/api/credit/disputes`, { headers: authed(accessToken) })).json();
  assert.ok(tracker.disputes.some((d) => d.id === dispute.id));
});

test('credit: an accurate item cannot be disputed', async (t) => {
  if (!dbUp) return t.skip('no database reachable');
  const { accessToken } = await registerMember();
  await fetch(`${base}/api/credit/pull`, { method: 'POST', headers: authed(accessToken) });
  const ov = await (await fetch(`${base}/api/credit`, { headers: authed(accessToken) })).json();

  const accurate = ov.accurate[0];
  const detail = await (await fetch(`${base}/api/credit/items/${accurate.id}`, { headers: authed(accessToken) })).json();
  assert.equal(detail.canDispute, false);
  assert.ok(detail.rights.length > 0); // FCRA rights always shown
});

test('money: link, sync, budgets, savings, and coaching', async (t) => {
  if (!dbUp) return t.skip('no database reachable');
  const { accessToken } = await registerMember();
  const jsonHeaders = { ...authed(accessToken), 'content-type': 'application/json' };

  // Link a (mock) bank and sync transactions.
  const linked = await fetch(`${base}/api/money/link`, {
    method: 'POST', headers: jsonHeaders, body: JSON.stringify({ publicToken: 'public-mock' }),
  });
  assert.equal(linked.status, 201);

  const synced = await (await fetch(`${base}/api/money/sync`, { method: 'POST', headers: authed(accessToken) })).json();
  assert.ok(synced.inserted > 0);

  // Syncing again inserts nothing (idempotent-ish dedupe).
  const resync = await (await fetch(`${base}/api/money/sync`, { method: 'POST', headers: authed(accessToken) })).json();
  assert.equal(resync.inserted, 0);

  // Set a tight dining budget so coaching flags an overage (mock spends $355 on dining).
  await fetch(`${base}/api/money/budgets`, {
    method: 'PUT', headers: jsonHeaders, body: JSON.stringify({ category: 'dining', monthlyTarget: 100 }),
  });
  // Create a savings goal.
  await fetch(`${base}/api/money/savings`, {
    method: 'PUT', headers: jsonHeaders, body: JSON.stringify({ label: 'Down payment', targetAmount: 10000, currentAmount: 1500 }),
  });

  const ov = await (await fetch(`${base}/api/money`, { headers: authed(accessToken) })).json();
  assert.equal(ov.linked, true);
  assert.ok(ov.month.income > 0 && ov.month.spend > 0);
  assert.ok(ov.budgets.some((b) => b.category === 'dining' && b.actual > b.monthly_target));
  assert.ok(ov.coaching.some((c) => c.type === 'over_budget'));
  assert.ok(ov.savings.some((s) => s.label === 'Down payment'));
});
