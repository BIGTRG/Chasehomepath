import './setup.js';
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { pool, healthcheck, closePool } from '../src/db/pool.js';
import { topTwoPlans } from '../src/services/journey.service.js';
import { proposeSlots, submitCheck, getLesson } from '../src/services/training.service.js';
import { grade, LESSONS, publicLesson } from '../src/education/lessons.js';
import { COUNSELOR } from '../src/lib/counselor.js';

// Onboarding v2: credit monitoring -> documents -> meeting with Maren -> plan -> training.

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
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

async function newMember() {
  const r = await call('POST', '/api/auth/register', { name: 'Jo Path', email: uniq('jo'), phone: '5551234567', password: 'a-strong-password', consent: { terms: true, dataNeverSold: true } });
  assert.equal(r.status, 201);
  return (await r.json()).accessToken;
}
async function completeDocs(t) {
  await call('POST', '/api/intake', { householdIncome: 58000, targetArea: 'Raleigh, NC', authorizeCreditPull: true }, t);
  for (const d of ['photo_id', 'pay_stub_1', 'pay_stub_2', 'w2_1', 'w2_2', 'tax_return_1', 'tax_return_2', 'employment']) {
    const r = await call('POST', '/api/intake/documents', { docType: d, fileName: `${d}.png`, mimeType: 'image/png', dataBase64: PNG }, t);
    assert.equal(r.status, 201, d);
  }
  const l = await call('POST', '/api/money/link', { publicToken: 'public-mock' }, t);
  assert.ok([200, 201].includes(l.status));
}

test('pure: top two plans, slot proposal, lesson grading', () => {
  assert.deepEqual(topTwoPlans('express'), ['express', 'focused']);
  assert.deepEqual(topTwoPlans('steady'), ['steady', 'focused']);
  assert.deepEqual(topTwoPlans('focused'), ['focused', 'express']);

  const slots = proposeSlots({ now: new Date('2026-09-14T12:00:00Z'), days: ['Mon', 'Wed'], hour: 19, count: 4 });
  assert.equal(slots.length, 4);
  for (const s of slots) {
    const wd = new Date(s).toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'short' });
    const hr = new Date(s).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false });
    assert.ok(['Mon', 'Wed'].includes(wd));
    assert.equal(hr, '19');
  }
  assert.throws(() => proposeSlots({ days: ['Mon'], hour: 3, count: 1 }));

  assert.equal(Object.keys(LESSONS).length, 18);
  for (const [ref, l] of Object.entries(LESSONS)) {
    assert.equal(l.quiz.length, 3, ref);
    assert.ok(l.points.length >= 3, ref);
    assert.ok(publicLesson(ref).quiz.every((q) => q.answer === undefined), 'answer key never leaves the server');
  }
  const key = LESSONS['mod/before/budget'].quiz.map((q) => q.answer);
  assert.equal(grade('mod/before/budget', key).passed, true);
  assert.equal(grade('mod/before/budget', key.map((a) => (a + 1) % 3)).passed, false);
  assert.equal(grade('mod/before/budget', [key[0], key[1], (key[2] + 1) % 3]).passed, true, '2 of 3 passes');
});

test('journey: status derives from data and the meeting gates on documents', async (t0) => {
  if (!dbUp) return t0.skip('no database reachable');
  const t = await newMember();
  let s = await (await call('GET', '/api/journey/status', undefined, t)).json();
  assert.equal(s.counselor.name, COUNSELOR.name);
  assert.equal(s.current, 'credit');

  const blocked = await call('POST', '/api/journey/meeting', {}, t);
  assert.equal(blocked.status, 422);

  const e = await call('POST', '/api/journey/credit-monitoring', { status: 'enrolled' }, t);
  assert.equal(e.status, 201);
  s = await (await call('GET', '/api/journey/status', undefined, t)).json();
  assert.equal(s.current, 'docs');
  assert.equal(s.docsGate.complete, false);

  await completeDocs(t);
  s = await (await call('GET', '/api/journey/status', undefined, t)).json();
  assert.equal(s.docsGate.complete, true);
  assert.equal(s.current, 'book');
});

test('journey: meeting with Maren builds an agenda, recommends two plans, and unlocks the score on completion', async (t0) => {
  if (!dbUp) return t0.skip('no database reachable');
  const t = await newMember();
  await call('POST', '/api/journey/credit-monitoring', { status: 'enrolled' }, t);
  await completeDocs(t);
  const pulled = await call('POST', '/api/credit/pull', undefined, t);
  assert.equal(pulled.status, 201);

  let credit = await (await call('GET', '/api/credit', undefined, t)).json();
  assert.equal(credit.score.withheld, true, 'score withheld before the consultation');

  const m = await call('POST', '/api/journey/meeting', {}, t);
  assert.equal(m.status, 201);
  const { meeting } = await m.json();
  assert.equal(meeting.status, 'started');
  assert.ok(meeting.roomCode);
  assert.equal(meeting.recommended.length, 2);
  const keys = meeting.agenda.map((a) => a.key);
  assert.ok(keys.includes('hello') && keys.includes('credit') && keys.includes('standing') && keys.includes('plans'));
  assert.ok(meeting.agenda[0].say.includes(COUNSELOR.name));
  assert.ok(meeting.agenda[0].say.includes('virtual counselor'), 'disclosure present');
  assert.ok(!meeting.agenda.some((a) => /\bAI\b/.test(a.say)), 'no AI wording');
  const plans = meeting.agenda.find((a) => a.key === 'plans');
  assert.deepEqual(plans.recommended, meeting.recommended);
  assert.ok(/Your score today is \d+/.test(meeting.agenda.find((a) => a.key === 'credit').say), 'score spoken inside the meeting');

  // Starting again returns the same open meeting.
  const again = await (await call('POST', '/api/journey/meeting', {}, t)).json();
  assert.equal(again.meeting.id, meeting.id);

  const s = await (await call('GET', '/api/journey/status', undefined, t)).json();
  assert.equal(s.current, 'meeting');
  assert.equal(s.appointment.counselor_kind, 'virtual');

  const done = await call('POST', `/api/journey/meeting/${meeting.id}/complete`, { chosenPlan: meeting.recommended[0] }, t);
  assert.equal(done.status, 200);
  credit = await (await call('GET', '/api/credit', undefined, t)).json();
  assert.ok(!credit.score.withheld, 'score unlocked by the virtual consultation');
  assert.ok(credit.score.value > 0);

  const twice = await call('POST', `/api/journey/meeting/${meeting.id}/complete`, {}, t);
  assert.equal(twice.status, 404);
});

test('training: propose, approve, window-gated lesson, pass marks module done, fail re-books', async (t0) => {
  if (!dbUp) return t0.skip('no database reachable');
  const t = await newMember();
  const closed = await call('POST', '/api/journey/training/approve', {}, t);
  assert.equal(closed.status, 422);

  const p = await call('POST', '/api/journey/training/propose', { days: ['Tue', 'Thu'], hour: 20 }, t);
  assert.equal(p.status, 201);
  const proposed = await p.json();
  assert.ok(proposed.sessions.length >= 13, 'one session per pending module');
  assert.ok(proposed.sessions.every((x) => x.status === 'proposed'));

  // Lesson is closed until approved.
  const first = proposed.sessions[0];
  let l = await (await call('GET', `/api/journey/training/lessons/${first.moduleId}`, undefined, t)).json();
  assert.equal(l.open, false);
  assert.match(l.reason, /Approve/);

  const a = await call('POST', '/api/journey/training/approve', {}, t);
  assert.equal(a.status, 200);
  const sched = await a.json();
  assert.ok(sched.sessions.every((x) => x.status === 'approved'));
  assert.ok(sched.next);

  l = await (await call('GET', `/api/journey/training/lessons/${first.moduleId}`, undefined, t)).json();
  assert.equal(l.open, false, 'closed until 15 minutes before the slot');
  assert.match(l.reason, /Opens/);
  const early = await call('POST', `/api/journey/training/lessons/${first.moduleId}/check`, { answers: [0, 0, 0] }, t);
  assert.equal(early.status, 422);

  // Inside the window (service-level clock override).
  const { rows: mem } = await pool.query(`SELECT m.id FROM members m JOIN users u ON u.id = m.user_id JOIN training_sessions ts ON ts.member_id = m.id WHERE ts.id = $1`, [first.id]);
  const member = { id: mem[0].id };
  const inWindow = new Date(new Date(first.scheduledAt).getTime() + 60e3);
  const info = await getLesson(member, first.moduleId, { now: inWindow });
  assert.equal(info.open, true);
  assert.equal(info.lesson.quiz.length, 3);
  const { rows: mod } = await pool.query(`SELECT content_ref FROM modules WHERE id = $1`, [first.moduleId]);
  const key = LESSONS[mod[0].content_ref].quiz.map((q) => q.answer);
  const actor = { userId: null, role: 'member', reqMeta: {} };

  const fail = await submitCheck(member, first.moduleId, { answers: key.map((k) => (k + 1) % 3) }, actor, { now: inWindow });
  assert.equal(fail.passed, false);
  const { rows: rebooked } = await pool.query(`SELECT status, scheduled_at FROM training_sessions WHERE member_id = $1 AND module_id = $2 AND deleted_at IS NULL ORDER BY scheduled_at`, [member.id, first.moduleId]);
  assert.deepEqual(rebooked.map((r) => r.status), ['failed', 'approved']);
  assert.equal(new Date(rebooked[1].scheduled_at) - new Date(rebooked[0].scheduled_at), 7 * 86400e3, 'one week out');

  // The failed slot is still inside its window: retry and pass.
  const pass = await submitCheck(member, first.moduleId, { answers: key }, actor, { now: inWindow });
  assert.equal(pass.passed, true);
  const { rows: asg } = await pool.query(`SELECT status FROM module_assignments WHERE member_id = $1 AND module_id = $2`, [member.id, first.moduleId]);
  assert.equal(asg[0].status, 'done');
});
