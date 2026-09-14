import './setup.js';
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { healthcheck, closePool } from '../src/db/pool.js';
import { env } from '../src/config/env.js';

// One-tap demo sign-in: default OFF; status endpoint always answers.
let server; let base; let dbUp = false;
before(async () => {
  try { dbUp = await Promise.race([healthcheck(), new Promise((r) => setTimeout(() => r(false), 2000))]); } catch { dbUp = false; }
  if (!dbUp) return;
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { if (server) await new Promise((r) => server.close(r)); await closePool(); });

test('demo sign-in reports its switch and refuses when off', async (t) => {
  if (!dbUp) return t.skip('db not reachable');
  const st = await (await fetch(`${base}/api/auth/demo`)).json();
  assert.equal(st.enabled, env.auth.demoLoginEnabled);
  if (env.auth.demoLoginEnabled) return;
  const r = await fetch(`${base}/api/auth/demo`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ persona: 'operator' }) });
  assert.equal(r.status, 401);
  assert.equal((await r.json()).error.code, 'demo_disabled');
});
