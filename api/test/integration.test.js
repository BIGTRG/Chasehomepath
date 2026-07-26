import './setup.js';
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { pool, healthcheck, closePool } from '../src/db/pool.js';
import { hashPassword } from '../src/auth/password.js';

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

// Create a staff user directly. onboarded=true gives a complete case + verified license.
async function createStaff({ onboarded = true } = {}) {
  const email = `staff_${process.pid}_${Math.floor(Math.random() * 1e9)}@example.test`;
  const password = 'staff-password-123';
  const hash = await hashPassword(password);
  const { rows } = await pool.query(
    `INSERT INTO users (email, password_hash, role, status) VALUES ($1,$2,'specialist','active') RETURNING id`,
    [email, hash],
  );
  const userId = rows[0].id;
  await pool.query(`INSERT INTO staff (user_id, title) VALUES ($1,'credit_specialist')`, [userId]);
  if (onboarded) {
    await pool.query(`INSERT INTO onboarding_cases (user_id, role_type, stage) VALUES ($1,'w2','complete')`, [userId]);
    await pool.query(
      `INSERT INTO license_records (user_id, license_type, status, verified_at) VALUES ($1,'nc_broker','active', now())`,
      [userId],
    );
  }
  const login = await post('/api/auth/login', { email, password });
  const session = await login.json();
  return { userId, email, token: session.accessToken };
}

// Create a user with an arbitrary role + matching profile row, and log in.
async function createUserWithRole(role, { certified = false } = {}) {
  const email = `${role}_${process.pid}_${Math.floor(Math.random() * 1e9)}@example.test`;
  const password = 'role-password-123';
  const hash = await hashPassword(password);
  const { rows } = await pool.query(
    `INSERT INTO users (email, password_hash, role, status) VALUES ($1,$2,$3,'active') RETURNING id`,
    [email, hash, role],
  );
  const userId = rows[0].id;
  if (['specialist', 'manager', 'admin'].includes(role)) {
    await pool.query(`INSERT INTO staff (user_id, title) VALUES ($1, $2)`, [userId, role === 'manager' ? 'manager' : 'credit_specialist']);
  } else if (role === 'partner') {
    await pool.query(
      `INSERT INTO partners (user_id, company_name, partner_type, certification_status, verified_authority)
       VALUES ($1, 'Acme Builders', 'gc', $2, true)`,
      [userId, certified ? 'certified' : 'pending'],
    );
  }
  const login = await post('/api/auth/login', { email, password });
  return { userId, email, token: (await login.json()).accessToken };
}

async function memberIdFor(email) {
  const { rows } = await pool.query(
    `SELECT m.id FROM members m JOIN users u ON u.id = m.user_id WHERE u.email = $1`,
    [email],
  );
  return rows[0].id;
}

test('team: onboarding gate blocks assigning a non-onboarded staffer', async (t) => {
  if (!dbUp) return t.skip('no database reachable');
  const member = await registerMember();
  const memberId = await memberIdFor(member.email);
  const staff = await createStaff({ onboarded: false });

  const res = await fetch(`${base}/api/team/members/${memberId}/assign`, {
    method: 'POST',
    headers: { ...authed(staff.token), 'content-type': 'application/json' },
    body: JSON.stringify({ assigneeUserId: staff.userId, assigneeKind: 'staff', roleOnTeam: 'Credit Specialist' }),
  });
  assert.equal(res.status, 403);
  assert.equal((await res.json()).error.code, 'compliance_block');
});

test('team: assign, no-PII team list, in-app messaging, ratings', async (t) => {
  if (!dbUp) return t.skip('no database reachable');
  const member = await registerMember();
  const memberId = await memberIdFor(member.email);
  const staff = await createStaff({ onboarded: true });

  // Assign the onboarded staffer.
  const assignRes = await fetch(`${base}/api/team/members/${memberId}/assign`, {
    method: 'POST',
    headers: { ...authed(staff.token), 'content-type': 'application/json' },
    body: JSON.stringify({ assigneeUserId: staff.userId, assigneeKind: 'staff', roleOnTeam: 'Credit Specialist' }),
  });
  assert.equal(assignRes.status, 201);

  // Member sees the team — but NEVER the staffer's email/phone (in-app only).
  const teamRes = await (await fetch(`${base}/api/team`, { headers: authed(member.accessToken) })).json();
  assert.equal(teamRes.team.length, 1);
  assert.equal(JSON.stringify(teamRes.team).includes(staff.email), false);
  const threadId = teamRes.threadId;

  // Member sends a message; staffer (on team) can read it and reply.
  await fetch(`${base}/api/team/threads/${threadId}/messages`, {
    method: 'POST', headers: { ...authed(member.accessToken), 'content-type': 'application/json' },
    body: JSON.stringify({ body: 'Hi team!' }),
  });
  const staffView = await (await fetch(`${base}/api/team/threads/${threadId}/messages`, { headers: authed(staff.token) })).json();
  assert.ok(staffView.messages.some((m) => m.body === 'Hi team!'));

  // A stranger cannot read the thread.
  const stranger = await registerMember();
  const denied = await fetch(`${base}/api/team/threads/${threadId}/messages`, { headers: authed(stranger.accessToken) });
  assert.equal(denied.status, 403);

  // Member rates the staffer; the average shows up in the team list.
  await fetch(`${base}/api/team/ratings`, {
    method: 'POST', headers: { ...authed(member.accessToken), 'content-type': 'application/json' },
    body: JSON.stringify({ ratedUserId: staff.userId, score: 5 }),
  });
  const team2 = await (await fetch(`${base}/api/team`, { headers: authed(member.accessToken) })).json();
  assert.equal(team2.team[0].avgResponsiveness, 5);
});

test('team: completing a consultation unlocks the credit score', async (t) => {
  if (!dbUp) return t.skip('no database reachable');
  const member = await registerMember();
  const memberId = await memberIdFor(member.email);
  const staff = await createStaff({ onboarded: true });

  // Pull credit — score withheld before the meeting.
  await fetch(`${base}/api/credit/pull`, { method: 'POST', headers: authed(member.accessToken) });
  let ov = await (await fetch(`${base}/api/credit`, { headers: authed(member.accessToken) })).json();
  assert.equal(ov.score.withheld, true);

  // Create a consultation appointment and mark it complete.
  const appt = await (await fetch(`${base}/api/team/members/${memberId}/appointments`, {
    method: 'POST', headers: { ...authed(staff.token), 'content-type': 'application/json' },
    body: JSON.stringify({ participantUserId: staff.userId, type: 'in_person', scheduledAt: '2026-07-20T15:00:00Z', isConsultation: true }),
  })).json();
  await fetch(`${base}/api/team/appointments/${appt.appointment.id}`, {
    method: 'PATCH', headers: { ...authed(staff.token), 'content-type': 'application/json' },
    body: JSON.stringify({ status: 'completed' }),
  });

  // Now the score is visible.
  ov = await (await fetch(`${base}/api/credit`, { headers: authed(member.accessToken) })).json();
  assert.equal(ov.score.withheld, false);
  assert.equal(ov.score.value, 612);
});

test('education: curriculum assigned, before unlocked, during/after locked; complete a module', async (t) => {
  if (!dbUp) return t.skip('no database reachable');
  const { accessToken } = await registerMember();

  const learn = await (await fetch(`${base}/api/learn`, { headers: authed(accessToken) })).json();
  assert.ok(learn.groups.before.length > 0);
  assert.ok(learn.groups.during.length > 0);
  assert.ok(learn.groups.after.length > 0);

  // "before" modules are available on day 0; "during"/"after" are locked (plan_day 0, active).
  assert.ok(learn.groups.before.every((m) => m.status === 'available'));
  assert.ok(learn.groups.during.every((m) => m.status === 'locked'));
  assert.ok(learn.groups.after.every((m) => m.status === 'locked'));

  // Completing an available module works and moves the progress counter.
  const target = learn.groups.before[0];
  const done = await fetch(`${base}/api/learn/${target.moduleId}/done`, { method: 'POST', headers: authed(accessToken) });
  assert.equal(done.status, 200);
  const after = await (await fetch(`${base}/api/learn`, { headers: authed(accessToken) })).json();
  assert.ok(after.progress.done >= 1);
  assert.ok(after.groups.before.find((m) => m.moduleId === target.moduleId).status === 'done');

  // A locked module cannot be completed.
  const locked = after.groups.during[0];
  const blocked = await fetch(`${base}/api/learn/${locked.moduleId}/done`, { method: 'POST', headers: authed(accessToken) });
  assert.equal(blocked.status, 404);
});

test('marketplace: listings are source-labeled with est monthly; plan-to-lot returns all-in', async (t) => {
  if (!dbUp) return t.skip('no database reachable');
  const { accessToken } = await registerMember();

  // Every listing carries its source and a friendly label (origin never hidden).
  const { listings } = await (await fetch(`${base}/api/marketplace/listings`, { headers: authed(accessToken) })).json();
  assert.ok(listings.length > 0);
  for (const l of listings) {
    assert.ok(['owned', 'optioned', 'partner', 'mls'].includes(l.source));
    assert.ok(l.sourceLabel);
  }
  // Houses have an est monthly; lots don't.
  const house = listings.find((l) => l.type === 'house');
  const lot = listings.find((l) => l.type === 'lot');
  assert.ok(house.estMonthly > 0);
  assert.equal(lot.estMonthly, null);

  // House-plan catalog.
  const { plans } = await (await fetch(`${base}/api/marketplace/plans`, { headers: authed(accessToken) })).json();
  assert.ok(plans.length >= 4);

  // Plan-to-lot: pick the smallest plan and get fitting lots with an all-in number.
  const smallPlan = plans[0];
  const match = await (await fetch(`${base}/api/marketplace/plans/${smallPlan.id}/lots`, { headers: authed(accessToken) })).json();
  assert.ok(Array.isArray(match.matches));
  if (match.matches.length > 0) {
    const m = match.matches[0];
    assert.ok(m.allIn > m.lot.price); // all-in adds the build cost
    assert.ok(m.estMonthly > 0);
    assert.equal(m.fit.fits, true);
  }
});

test('ingestion: MLS sync dedups and quality-gates; second run inserts nothing', async (t) => {
  if (!dbUp) return t.skip('no database reachable');
  const manager = await createUserWithRole('manager');

  const first = await (await fetch(`${base}/api/ingest/mls`, { method: 'POST', headers: authed(manager.token) })).json();
  assert.equal(first.fetched, 4);
  assert.equal(first.inserted, 2);   // 200500 + 200501
  assert.equal(first.skipped, 1);    // 100234 dup of seeded listing
  assert.equal(first.rejected, 1);   // 200502 fails quality gate
  assert.ok(first.rejections[0].issues.length > 0);

  const second = await (await fetch(`${base}/api/ingest/mls`, { method: 'POST', headers: authed(manager.token) })).json();
  assert.equal(second.inserted, 0);  // all now exist
});

test('ingestion: partner submits, approval blocked until certified', async (t) => {
  if (!dbUp) return t.skip('no database reachable');
  const partner = await createUserWithRole('partner', { certified: false });
  const manager = await createUserWithRole('manager');

  // Partner submits a listing — held pending.
  const submitted = await fetch(`${base}/api/ingest/partner-listings`, {
    method: 'POST', headers: { ...authed(partner.token), 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'house', price: 210000, address: '5 Cedar Ln', beds: 3, baths: 2, sqft: 1250 }),
  });
  assert.equal(submitted.status, 201);
  const listingId = (await submitted.json()).listing.id;

  // Appears in the operator pending queue.
  const pending = await (await fetch(`${base}/api/ingest/pending`, { headers: authed(manager.token) })).json();
  assert.ok(pending.pending.some((p) => p.id === listingId));

  // Approval blocked while partner is uncertified (spec §6.1).
  const blocked = await fetch(`${base}/api/ingest/listings/${listingId}/review`, {
    method: 'POST', headers: { ...authed(manager.token), 'content-type': 'application/json' },
    body: JSON.stringify({ decision: 'approve' }),
  });
  assert.equal(blocked.status, 403);

  // Certify the partner, then approval succeeds and the listing goes live.
  await pool.query(`UPDATE partners SET certification_status = 'certified' WHERE user_id = $1`, [partner.userId]);
  const approved = await fetch(`${base}/api/ingest/listings/${listingId}/review`, {
    method: 'POST', headers: { ...authed(manager.token), 'content-type': 'application/json' },
    body: JSON.stringify({ decision: 'approve' }),
  });
  assert.equal(approved.status, 200);
  assert.equal((await approved.json()).listing.status, 'active');
});

test('operator: roster scoping, client detail access, capacity, ratings, HQ admin', async (t) => {
  if (!dbUp) return t.skip('no database reachable');
  const member = await registerMember();
  const memberId = await memberIdFor(member.email);
  const admin = await createUserWithRole('admin');
  const specialist = await createStaff({ onboarded: true });
  const outsider = await createStaff({ onboarded: true });

  // Admin sees the member in the roster.
  const adminRoster = await (await fetch(`${base}/api/operator/roster`, { headers: authed(admin.token) })).json();
  assert.ok(adminRoster.roster.some((r) => r.memberId === memberId));

  // A specialist NOT assigned sees an empty (or member-absent) roster.
  const outRoster = await (await fetch(`${base}/api/operator/roster`, { headers: authed(outsider.token) })).json();
  assert.equal(outRoster.roster.some((r) => r.memberId === memberId), false);

  // Assign the specialist, then they can open the client detail.
  await fetch(`${base}/api/team/members/${memberId}/assign`, {
    method: 'POST', headers: { ...authed(specialist.token), 'content-type': 'application/json' },
    body: JSON.stringify({ assigneeUserId: specialist.userId, assigneeKind: 'staff', roleOnTeam: 'Credit Specialist' }),
  });
  const detail = await fetch(`${base}/api/operator/members/${memberId}`, { headers: authed(specialist.token) });
  assert.equal(detail.status, 200);
  const detailJson = await detail.json();
  assert.equal(detailJson.plan.tracks.length, 6);

  // An unassigned specialist is forbidden from the detail.
  const denied = await fetch(`${base}/api/operator/members/${memberId}`, { headers: authed(outsider.token) });
  assert.equal(denied.status, 403);

  // Capacity + ratings dashboards (manager/admin).
  const cap = await (await fetch(`${base}/api/operator/capacity`, { headers: authed(admin.token) })).json();
  assert.ok(cap.capacity.some((c) => c.userId === specialist.userId && c.clientCount >= 1));

  // HQ admin: list users and flip a status.
  const users = await (await fetch(`${base}/api/operator/users?role=member`, { headers: authed(admin.token) })).json();
  assert.ok(users.users.length > 0);
  const patched = await fetch(`${base}/api/operator/users/${member.user.id}`, {
    method: 'PATCH', headers: { ...authed(admin.token), 'content-type': 'application/json' },
    body: JSON.stringify({ status: 'suspended' }),
  });
  assert.equal((await patched.json()).user.status, 'suspended');

  // A specialist cannot reach the admin-only users endpoint.
  const forbidden = await fetch(`${base}/api/operator/users`, { headers: authed(specialist.token) });
  assert.equal(forbidden.status, 403);
});

test('homeowner: recording a home unlocks after-modules and drives the dashboard', async (t) => {
  if (!dbUp) return t.skip('no database reachable');
  const { accessToken } = await registerMember();
  const jsonHeaders = { ...authed(accessToken), 'content-type': 'application/json' };

  // Not a homeowner yet.
  const before = await (await fetch(`${base}/api/home`, { headers: authed(accessToken) })).json();
  assert.equal(before.isHomeowner, false);

  // "after you own it" modules are locked before homeownership.
  const learnBefore = await (await fetch(`${base}/api/learn`, { headers: authed(accessToken) })).json();
  assert.ok(learnBefore.groups.after.every((m) => m.status === 'locked'));

  // Record the home (interest rate high enough to trigger the informational refi alert).
  const rec = await fetch(`${base}/api/home`, {
    method: 'POST', headers: jsonHeaders,
    body: JSON.stringify({ address: '10 New Home Ln', purchasePrice: 200000, mortgageBalance: 190000, interestRate: 0.08, monthlyTaxes: 250, monthlyInsurance: 90 }),
  });
  assert.equal(rec.status, 201);

  // Dashboard now reflects homeownership, a value estimate, maintenance, and a refi alert.
  const dash = await (await fetch(`${base}/api/home`, { headers: authed(accessToken) })).json();
  assert.equal(dash.isHomeowner, true);
  assert.ok(dash.value.estimated >= 200000);
  assert.ok(dash.maintenance.length >= 4);
  assert.ok(dash.refiAlert && /specialist|team/i.test(dash.refiAlert.message));
  assert.equal(/\d+(\.\d+)?\s*%/.test(dash.refiAlert.message), false); // no quoted rate

  // The plan is completed, so "after you own it" modules are now available.
  const learnAfter = await (await fetch(`${base}/api/learn`, { headers: authed(accessToken) })).json();
  assert.ok(learnAfter.groups.after.some((m) => m.status === 'available'));

  // Completing a maintenance task works.
  const task = dash.maintenance[0];
  const done = await fetch(`${base}/api/home/maintenance/${task.id}/done`, { method: 'POST', headers: authed(accessToken) });
  assert.equal(done.status, 200);
});

test('onboarding: pipeline runs to complete and opens the onboarding gate', async (t) => {
  if (!dbUp) return t.skip('no database reachable');
  const admin = await createUserWithRole('admin');
  const newHire = await createStaff({ onboarded: false });
  const member = await registerMember();
  const memberId = await memberIdFor(member.email);
  const adminHeaders = { ...authed(admin.token), 'content-type': 'application/json' };

  // Give the hire a license so the license_verify step can pass.
  await pool.query(
    `INSERT INTO license_records (user_id, license_type, number, status) VALUES ($1,'nc_broker',$2,'unverified')`,
    [newHire.userId, (await import('../src/lib/crypto.js')).encrypt('NC-9001')],
  );

  // Before onboarding completes, assigning the hire to a client is blocked (gate).
  const early = await fetch(`${base}/api/team/members/${memberId}/assign`, {
    method: 'POST', headers: { ...authed(admin.token), 'content-type': 'application/json' },
    body: JSON.stringify({ assigneeUserId: newHire.userId, assigneeKind: 'staff', roleOnTeam: 'Specialist' }),
  });
  assert.equal(early.status, 403);

  // Start + walk the pipeline.
  const started = await (await fetch(`${base}/api/onboarding/cases`, {
    method: 'POST', headers: adminHeaders, body: JSON.stringify({ userId: newHire.userId, roleType: 'w2' }),
  })).json();
  const caseView = await (await fetch(`${base}/api/onboarding/cases/${started.caseId}`, { headers: authed(admin.token) })).json();
  assert.equal(caseView.steps.length, 8);

  let lastStage;
  for (const step of caseView.steps) {
    const r = await (await fetch(`${base}/api/onboarding/steps/${step.id}/advance`, {
      method: 'POST', headers: adminHeaders, body: JSON.stringify({ decision: 'pass' }),
    })).json();
    lastStage = r.stage;
  }
  assert.equal(lastStage, 'complete');

  // Now assignment succeeds — onboarding complete + license verified.
  const ok = await fetch(`${base}/api/team/members/${memberId}/assign`, {
    method: 'POST', headers: { ...authed(admin.token), 'content-type': 'application/json' },
    body: JSON.stringify({ assigneeUserId: newHire.userId, assigneeKind: 'staff', roleOnTeam: 'Specialist' }),
  });
  assert.equal(ok.status, 201);
});

test('onboarding: license_verify fails when no license is on file', async (t) => {
  if (!dbUp) return t.skip('no database reachable');
  const admin = await createUserWithRole('admin');
  const hire = await createStaff({ onboarded: false });
  const adminHeaders = { ...authed(admin.token), 'content-type': 'application/json' };

  const started = await (await fetch(`${base}/api/onboarding/cases`, {
    method: 'POST', headers: adminHeaders, body: JSON.stringify({ userId: hire.userId, roleType: 'w2' }),
  })).json();
  const { steps } = await (await fetch(`${base}/api/onboarding/cases/${started.caseId}`, { headers: authed(admin.token) })).json();
  const licenseStep = steps.find((s) => s.step === 'license_verify');

  const res = await fetch(`${base}/api/onboarding/steps/${licenseStep.id}/advance`, {
    method: 'POST', headers: adminHeaders, body: JSON.stringify({ decision: 'pass' }),
  });
  assert.equal(res.status, 403); // cannot pass without a verifiable license
});

test('partner: certification flow with license verification gates go-live', async (t) => {
  if (!dbUp) return t.skip('no database reachable');
  const partner = await createUserWithRole('partner', { certified: false });
  const manager = await createUserWithRole('manager');
  const pHeaders = { ...authed(partner.token), 'content-type': 'application/json' };

  // Profile starts pending.
  const prof0 = await (await fetch(`${base}/api/partner/profile`, { headers: authed(partner.token) })).json();
  assert.equal(prof0.certificationStatus, 'pending');

  // Partner submits certification (e-signs agreement + records license) -> in_review.
  const submit = await fetch(`${base}/api/partner/certification`, {
    method: 'POST', headers: pHeaders, body: JSON.stringify({ licenseType: 'nc_broker', licenseNumber: 'NC-12345' }),
  });
  assert.equal(submit.status, 201);
  const prof1 = await (await fetch(`${base}/api/partner/profile`, { headers: authed(partner.token) })).json();
  assert.equal(prof1.certificationStatus, 'in_review');
  assert.equal(prof1.agreements.length, 1);

  // Partner submits a listing — held pending; can't be approved while not certified.
  const listing = await (await fetch(`${base}/api/partner/listings`, {
    method: 'POST', headers: pHeaders, body: JSON.stringify({ type: 'house', price: 220000, address: '9 Birch', beds: 3, baths: 2, sqft: 1300 }),
  })).json();
  const blocked = await fetch(`${base}/api/ingest/listings/${listing.listing.id}/review`, {
    method: 'POST', headers: { ...authed(manager.token), 'content-type': 'application/json' }, body: JSON.stringify({ decision: 'approve' }),
  });
  assert.equal(blocked.status, 403);

  // Operator certifies the partner (license verification runs) -> certified.
  const certify = await fetch(`${base}/api/partner/${partner.userId}/certify`, { method: 'POST', headers: authed(manager.token) });
  assert.equal(certify.status, 200);
  assert.equal((await certify.json()).partner.certification_status, 'certified');

  // Now the listing can go live.
  const approved = await fetch(`${base}/api/ingest/listings/${listing.listing.id}/review`, {
    method: 'POST', headers: { ...authed(manager.token), 'content-type': 'application/json' }, body: JSON.stringify({ decision: 'approve' }),
  });
  assert.equal(approved.status, 200);
  assert.equal((await approved.json()).listing.status, 'active');
});

test('agent: answers plan questions and escalates rate/term/legal', async (t) => {
  if (!dbUp) return t.skip('no database reachable');
  const { accessToken } = await registerMember();
  const jsonHeaders = { ...authed(accessToken), 'content-type': 'application/json' };

  const ans = await (await fetch(`${base}/api/agent/ask`, {
    method: 'POST', headers: jsonHeaders, body: JSON.stringify({ question: 'What day of my plan am I on?' }),
  })).json();
  assert.equal(ans.escalated, false);
  assert.ok(ans.answer.length > 0);

  const esc = await (await fetch(`${base}/api/agent/ask`, {
    method: 'POST', headers: jsonHeaders, body: JSON.stringify({ question: 'What interest rate can I get?' }),
  })).json();
  assert.equal(esc.escalated, true);
  assert.equal(esc.topic, 'rate');
});

test('assistance: program matching evaluates rules_json and lowers marketplace est monthly', async (t) => {
  if (!dbUp) return t.skip('no database reachable');
  const { accessToken } = await registerMember();

  // Give the member income (via sync) and a visible-to-engine credit score.
  await fetch(`${base}/api/money/link`, {
    method: 'POST', headers: { ...authed(accessToken), 'content-type': 'application/json' }, body: JSON.stringify({ publicToken: 'x' }),
  });
  await fetch(`${base}/api/money/sync`, { method: 'POST', headers: authed(accessToken) });
  await fetch(`${base}/api/credit/pull`, { method: 'POST', headers: authed(accessToken) });

  // Baseline marketplace est monthly (no assistance yet).
  const before = await (await fetch(`${base}/api/marketplace/listings?type=house`, { headers: authed(accessToken) })).json();
  const houseBefore = before.listings[0];

  // Evaluate assistance — with mock income (~$22k/yr) and score 612, income-limited
  // programs with a low-enough credit floor should match.
  const assist = await (await fetch(`${base}/api/assistance`, { headers: authed(accessToken) })).json();
  assert.ok(Array.isArray(assist.programs));
  assert.ok(assist.programs.length >= 5);
  assert.ok(assist.total >= 0);

  // If any assistance matched, the same house now estimates a lower monthly payment.
  if (assist.total > 0) {
    const after = await (await fetch(`${base}/api/marketplace/listings?type=house`, { headers: authed(accessToken) })).json();
    const houseAfter = after.listings.find((l) => l.id === houseBefore.id);
    assert.ok(houseAfter.estMonthly <= houseBefore.estMonthly);
    assert.ok(houseAfter.assistanceApplied > 0);
  }
});
