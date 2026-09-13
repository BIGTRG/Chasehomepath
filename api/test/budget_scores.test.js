import './setup.js';
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { healthcheck, closePool } from '../src/db/pool.js';

// Budget setup from bank data + credit score history display (Deon, 2026-09-13 00:41).

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
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const uniq = (p) => `${p}_${process.pid}_${Math.floor(Math.random() * 1e9)}@example.test`;

async function newMember() {
  const r = await call('POST', '/api/auth/register', { name: 'Bee Budget', email: uniq('bee'), phone: '5551234567', password: 'a-strong-password', consent: { terms: true, dataNeverSold: true } });
  assert.equal(r.status, 201);
  return (await r.json()).accessToken;
}

test('budget: proposal from bank data, setup saves lines + to-home + goal, journey step 7 flips', async (t) => {
  if (!dbUp) return t.skip('db not reachable');
  const tok = await newMember();
  await call('POST', '/api/intake', { householdIncome: 58000, targetArea: 'Raleigh, NC', authorizeCreditPull: true }, tok);

  let p = await (await call('GET', '/api/money/budget/proposal', undefined, tok)).json();
  assert.equal(p.linked, false);
  assert.equal(p.lines.length, 0);
  assert.equal(p.incomeSource, 'stated');
  assert.ok(p.monthlyIncome > 3000 && p.monthlyIncome < 4000, 'take-home estimate from stated gross');

  assert.equal((await call('POST', '/api/money/link', { publicToken: 'public-mock' }, tok)).status, 201);
  await call('POST', '/api/money/sync', undefined, tok);
  p = await (await call('GET', '/api/money/budget/proposal', undefined, tok)).json();
  assert.equal(p.linked, true);
  assert.equal(p.incomeSource, 'bank');
  const dining = p.lines.find((l) => l.category === 'dining');
  assert.ok(dining && dining.trimmed && dining.monthlyTarget < dining.actual, 'discretionary trimmed');
  const housing = p.lines.find((l) => l.category === 'housing');
  assert.equal(housing.monthlyTarget, housing.actual, 'fixed kept at actual');
  assert.ok(p.toHome >= 0);

  let st = await (await call('GET', '/api/journey/status', undefined, tok)).json();
  const step = st.steps.find((s) => s.key === 'budget');
  assert.ok(step && !step.done);
  assert.equal(st.steps.length, 7);

  const r = await call('POST', '/api/money/budget/setup', { lines: p.lines.map((l) => ({ category: l.category, monthlyTarget: l.monthlyTarget })), toHome: p.toHome, downPaymentTarget: 12000 }, tok);
  assert.equal(r.status, 201);

  const ov = await (await call('GET', '/api/money', undefined, tok)).json();
  assert.equal(ov.budgetSetup, true);
  assert.equal(ov.toHome, p.toHome);
  assert.equal(ov.budgets.length, p.lines.length, 'save line not mixed into spend lines');
  assert.ok(ov.budgets.every((b) => b.label));
  assert.ok(ov.recent.length > 0);
  assert.equal(ov.savings.find((g) => g.label === 'Down payment and closing').target_amount, 12000);

  st = await (await call('GET', '/api/journey/status', undefined, tok)).json();
  assert.equal(st.steps.find((s) => s.key === 'budget').done, true);

  // Re-setup replaces lines, no unique-index clash.
  const r2 = await call('POST', '/api/money/budget/setup', { lines: [{ category: 'housing', monthlyTarget: 1100 }], toHome: 500 }, tok);
  assert.equal(r2.status, 201);
  const ov2 = await (await call('GET', '/api/money', undefined, tok)).json();
  assert.equal(ov2.budgets.length, 1);

  assert.equal((await call('POST', '/api/money/budget/setup', { lines: [{ category: 'x', monthlyTarget: -1 }] }, tok)).status, 422);
});

test('scores: withheld before first meeting, report pull seeds history, member logs bureau readings', async (t) => {
  if (!dbUp) return t.skip('db not reachable');
  const tok = await newMember();
  await call('POST', '/api/intake', { householdIncome: 58000, targetArea: 'Raleigh, NC', authorizeCreditPull: true }, tok);
  assert.equal((await call('POST', '/api/credit/pull', undefined, tok)).status, 201);

  let h = await (await call('GET', '/api/credit/scores', undefined, tok)).json();
  assert.equal(h.withheld, true);
  assert.equal((await call('POST', '/api/credit/scores', { experian: 640 }, tok)).status, 403, 'cannot log before the meeting unlocks scores');

  // Meeting with the virtual counselor unlocks the score (docs gate first).
  await call('POST', '/api/journey/credit-monitoring', { status: 'enrolled' }, tok);
  for (const d of ['photo_id', 'pay_stub_1', 'pay_stub_2', 'w2_1', 'w2_2', 'tax_return_1', 'tax_return_2', 'employment']) {
    await call('POST', '/api/intake/documents', { docType: d, fileName: `${d}.png`, mimeType: 'image/png', dataBase64: PNG }, tok);
  }
  await call('POST', '/api/money/link', { publicToken: 'public-mock' }, tok);
  const m = await (await call('POST', '/api/journey/meeting', {}, tok)).json();
  assert.equal((await call('POST', `/api/journey/meeting/${m.meeting.id}/complete`, { chosenPlan: null }, tok)).status, 200);

  h = await (await call('GET', '/api/credit/scores', undefined, tok)).json();
  assert.equal(h.withheld, false);
  assert.equal(h.points.length, 1, 'report pull seeded one tri-merge point');
  assert.equal(h.points[0].source, 'report');
  assert.ok(h.nextCheck);

  const r = await call('POST', '/api/credit/scores', { experian: 640, equifax: 651, transunion: 638, asOf: '2099-01-15' }, tok);
  assert.equal(r.status, 201);
  h = await r.json();
  assert.equal(h.points.length, 2);
  assert.equal(h.points[1].score, 643, 'average of the three bureaus for the day');
  assert.equal(h.latest, 643);
  assert.equal(h.change, 643 - h.start);
  assert.equal(h.bureaus.find((b) => b.bureau === 'equifax').score, 651);

  // Same day again: upsert, not a duplicate.
  await call('POST', '/api/credit/scores', { experian: 645, asOf: '2099-01-15' }, tok);
  h = await (await call('GET', '/api/credit/scores', undefined, tok)).json();
  assert.equal(h.points.length, 2);
  assert.equal((await call('POST', '/api/credit/scores', {}, tok)).status, 409);
  assert.equal((await call('POST', '/api/credit/scores', { experian: 900 }, tok)).status, 422);
});
