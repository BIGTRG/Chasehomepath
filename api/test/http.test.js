import './setup.js';
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';

// HTTP-level tests for routes that don't touch the database. DB-backed flows
// (register/login round-trips) are exercised in CI where Postgres is available.

let server;
let base;

before(async () => {
  const app = createApp();
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((r) => server.close(r));
});

test('GET /api/healthz returns ok', async () => {
  const r = await fetch(`${base}/api/healthz`);
  assert.equal(r.status, 200);
  assert.equal((await r.json()).status, 'ok');
});

test('unknown route returns 404 with error envelope', async () => {
  const r = await fetch(`${base}/api/does-not-exist`);
  assert.equal(r.status, 404);
  assert.equal((await r.json()).error.code, 'not_found');
});

test('login with invalid body returns 422 validation error', async () => {
  const r = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'not-an-email' }),
  });
  assert.equal(r.status, 422);
  assert.equal((await r.json()).error.code, 'validation_error');
});

test('protected route without token returns 401', async () => {
  const r = await fetch(`${base}/api/auth/me`);
  assert.equal(r.status, 401);
});

test('MFA setup without token returns 401', async () => {
  const r = await fetch(`${base}/api/auth/mfa/setup`, { method: 'POST' });
  assert.equal(r.status, 401);
});
