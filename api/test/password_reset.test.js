import './setup.js';
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createApp } from '../src/app.js';

// HTTP-level checks for the password reset endpoints that don't need Postgres:
// input validation, token shape rejection, and the mailer's disabled-mode contract.
// The full round trip (forgot → email → reset → old sessions dead) is exercised
// against the deployed instance in deploy/e2e_smoke.py.

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

const post = (path, body) =>
  fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

test('forgot with invalid email returns 422', async () => {
  const r = await post('/api/auth/forgot', { email: 'not-an-email' });
  assert.equal(r.status, 422);
  assert.equal((await r.json()).error.code, 'validation_error');
});

test('reset with a too-short token returns 422', async () => {
  const r = await post('/api/auth/reset', { token: 'short', password: 'GoodPassword123' });
  assert.equal(r.status, 422);
});

test('reset with a weak password returns 422 before any lookup', async () => {
  const r = await post('/api/auth/reset', {
    token: crypto.randomBytes(48).toString('base64url'),
    password: 'short',
  });
  assert.equal(r.status, 422);
  const body = await r.json();
  assert.match(body.error.message, /at least 10 characters/i);
});

test('mailer without SMTP config reports sent:false and does not throw', async () => {
  const { sendMail } = await import('../src/lib/mailer.js');
  const result = await sendMail({ to: 'x@example.com', subject: 't', text: 'b' });
  assert.equal(result.sent, false);
});
