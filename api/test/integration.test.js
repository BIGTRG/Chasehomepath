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
