import { query } from '../db/pool.js';
import { audit } from '../lib/audit.js';
import { ValidationError, NotFoundError } from '../lib/errors.js';
import { COUNSELOR } from '../lib/counselor.js';
import { getChecklist, getIntake } from './intake.service.js';
import { readinessForMember, gatherInputs } from './readiness.service.js';
import { assess } from '../readiness/engine.js';
import { getCreditOverview, scoreForConsultation } from './credit.service.js';
import { listPlans } from './billing.service.js';
import { checkCopy } from '../compliance/copyGate.js';

/**
 * Onboarding v2 (Deon, 2026-09-12 23:39). Six steps to a paid plan:
 *   1 account (done at register)  2 credit monitoring  3 documents
 *   4 book (Maren now, or a person)  5 meeting -> plan + pay  6 plan + training
 * Status is derived from data, never stored, so it cannot drift.
 */

/** Documents that gate the meeting. Co-applicant ID is optional. */
const REQUIRED_DOCS = new Set(['photo_id', 'pay_stub_1', 'pay_stub_2', 'w2_1', 'w2_2', 'tax_return_1', 'tax_return_2', 'employment', 'bank_link']);

export async function journeyStatus(member) {
  const [intake, checklist, enroll, appt, sub, meeting, training] = await Promise.all([
    getIntake(member.id),
    getChecklist(member.id),
    query(`SELECT status, provider, enrolled_at FROM credit_monitoring_enrollments WHERE member_id = $1`, [member.id]).then((r) => r.rows[0] ?? null),
    query(`SELECT id, type, counselor_kind, scheduled_at, status, room_code FROM appointments
            WHERE member_id = $1 AND is_consultation AND deleted_at IS NULL AND status <> 'cancelled'
            ORDER BY created_at DESC LIMIT 1`, [member.id]).then((r) => r.rows[0] ?? null),
    query(`SELECT plan_code, status FROM subscriptions WHERE member_id = $1 AND status <> 'cancelled' AND deleted_at IS NULL LIMIT 1`, [member.id]).then((r) => r.rows[0] ?? null),
    query(`SELECT id, status FROM virtual_meetings WHERE member_id = $1 ORDER BY started_at DESC LIMIT 1`, [member.id]).then((r) => r.rows[0] ?? null),
    query(`SELECT count(*)::int AS n FROM training_sessions WHERE member_id = $1 AND status IN ('approved','passed','failed') AND deleted_at IS NULL`, [member.id]).then((r) => r.rows[0].n),
  ]);

  const required = checklist.items.filter((i) => REQUIRED_DOCS.has(i.docType));
  const docsDone = required.filter((i) => i.done).length;
  const docsComplete = docsDone === required.length && Boolean(intake?.household_income);
  const consultDone = appt?.status === 'completed';

  const steps = [
    { key: 'account', title: 'Account created', done: true },
    { key: 'credit', title: 'Credit monitoring', done: Boolean(enroll), detail: enroll ? `Enrolled ${enroll.provider === 'smartcredit' ? 'with SmartCredit' : ''}`.trim() : 'Sign up so your report flows into your plan' },
    { key: 'docs', title: 'Upload everything', done: docsComplete, detail: `${docsDone} of ${required.length} documents${intake?.household_income ? '' : ', income needed'}` },
    { key: 'book', title: 'Book your meeting', done: Boolean(appt), detail: appt ? (appt.counselor_kind === 'virtual' ? `With ${COUNSELOR.name}` : `${appt.type === 'in_person' ? 'In office' : 'Video'} with a specialist`) : `${COUNSELOR.name} now, or a person` },
    { key: 'meeting', title: 'Your meeting and plan choice', done: Boolean(sub) && consultDone, detail: sub ? 'Plan started' : consultDone ? 'Choose your plan' : 'Credit, where you stand, your two best plans' },
    { key: 'training', title: 'Training scheduled', done: training > 0, detail: training > 0 ? `${training} lessons on your calendar` : 'Short lessons at times you approve' },
  ];
  const currentIndex = steps.findIndex((s) => !s.done);
  return {
    counselor: { name: COUNSELOR.name, title: COUNSELOR.title },
    steps,
    current: currentIndex === -1 ? 'done' : steps[currentIndex].key,
    docsGate: { done: docsDone, total: required.length, incomeSet: Boolean(intake?.household_income), complete: docsComplete },
    appointment: appt,
    meeting,
    subscription: sub,
  };
}

/** Step 2: record credit-monitoring enrollment (member confirms, or links an existing account). */
export async function enrollCreditMonitoring(member, { status = 'enrolled', externalRef = null }, actor) {
  if (!['enrolled', 'linked', 'declined'].includes(status)) throw new ValidationError('status must be enrolled, linked, or declined');
  const { rows } = await query(
    `INSERT INTO credit_monitoring_enrollments (member_id, provider, status, external_ref)
     VALUES ($1, 'smartcredit', $2, $3)
     ON CONFLICT (member_id, provider) DO UPDATE SET status = EXCLUDED.status, external_ref = COALESCE(EXCLUDED.external_ref, credit_monitoring_enrollments.external_ref), enrolled_at = now()
     RETURNING id, status, provider, enrolled_at`,
    [member.id, status, externalRef],
  );
  await audit({ actorUserId: actor.userId, actorRole: actor.role, action: 'journey.credit_monitoring', entityType: 'credit_monitoring_enrollment', entityId: rows[0].id, metadata: { status }, ...actor.reqMeta });
  return rows[0];
}

/** Which two of the three plans to recommend, from the readiness engine's pace. */
export function topTwoPlans(recommended) {
  if (recommended === 'express') return ['express', 'focused'];
  if (recommended === 'steady') return ['steady', 'focused'];
  return ['focused', 'express'];
}

const money = (v) => (v == null ? null : `$${Math.round(Number(v)).toLocaleString('en-US')}`);

/**
 * Step 4/5: start a meeting with Maren. Creates the consultation appointment
 * (counselor_kind virtual, supervised by the lead specialist so a person owns the
 * record) and builds the agenda from the member's file. Requires the document gate.
 */
export async function startVirtualMeeting(memberIn, actor) {
  let member = memberIn;
  const status = await journeyStatus(member);
  if (!status.docsGate.complete) throw new ValidationError('Upload your documents and income before the meeting');

  const existing = await query(`SELECT vm.id, vm.status, vm.agenda, vm.recommended, a.room_code FROM virtual_meetings vm JOIN appointments a ON a.id = vm.appointment_id
                                 WHERE vm.member_id = $1 AND vm.status = 'started' ORDER BY vm.started_at DESC LIMIT 1`, [member.id]);
  if (existing.rows[0]) return shape(existing.rows[0]);

  const [, credit, plans, intake, score, inputs, who] = await Promise.all([
    readinessForMember(member, actor), getCreditOverview(member), listPlans(), getIntake(member.id), scoreForConsultation(member.id), gatherInputs(member),
    query(`SELECT display_name AS name FROM users WHERE id = $1`, [member.user_id]).then((r) => r.rows[0]?.name ?? null),
  ]);
  // Inside the consultation the score is in play, so the standing read uses it.
  const readiness = assess(score ? { ...inputs, creditScore: score, scoreWithheld: false } : inputs);
  const rec = topTwoPlans(readiness.recommendedPlan);
  member = { ...member, name: member.name || who };
  const agenda = buildAgenda({ member, readiness, credit, plans: plans.plans, rec, intake, score });

  const { rows: staff } = await query(
    `SELECT COALESCE((SELECT ta.staff_or_partner_user FROM team_assignments ta WHERE ta.member_id = $1 AND ta.assignee_kind = 'staff' AND ta.deleted_at IS NULL ORDER BY ta.assigned_at LIMIT 1),
                     (SELECT u.id FROM users u WHERE u.role IN ('specialist','manager','admin') AND u.deleted_at IS NULL ORDER BY u.role = 'specialist' DESC, u.created_at LIMIT 1)) AS id`,
    [member.id],
  );
  // No staff yet (fresh install): the member's own user holds the participant slot until a specialist is assigned.
  const participantId = staff[0]?.id ?? member.user_id;

  const { rows: appts } = await query(
    `INSERT INTO appointments (member_id, participant_id, type, counselor_kind, scheduled_at, is_consultation)
     VALUES ($1, $2, 'virtual', 'virtual', now(), true) RETURNING id, room_code`,
    [member.id, participantId],
  );
  const { rows } = await query(
    `INSERT INTO virtual_meetings (member_id, appointment_id, agenda, recommended) VALUES ($1, $2, $3, $4)
     RETURNING id, status, agenda, recommended`,
    [member.id, appts[0].id, JSON.stringify(agenda), JSON.stringify(rec)],
  );
  await audit({ actorUserId: actor.userId, actorRole: actor.role, action: 'journey.virtual_meeting_started', entityType: 'virtual_meeting', entityId: rows[0].id, metadata: { appointmentId: appts[0].id, recommended: rec }, ...actor.reqMeta });
  return shape({ ...rows[0], room_code: appts[0].room_code });
}

function shape(r) {
  return { id: r.id, status: r.status, agenda: r.agenda, recommended: r.recommended, roomCode: r.room_code, counselor: COUNSELOR };
}

export async function getVirtualMeeting(member, id) {
  const { rows } = await query(`SELECT vm.id, vm.status, vm.agenda, vm.recommended, vm.chosen_plan, a.room_code FROM virtual_meetings vm JOIN appointments a ON a.id = vm.appointment_id WHERE vm.id = $1 AND vm.member_id = $2`, [id, member.id]);
  if (!rows[0]) throw new NotFoundError('Meeting not found');
  return { ...shape(rows[0]), chosenPlan: rows[0].chosen_plan };
}

/** The meeting is over: mark the consultation complete (unlocks the score) and record the plan picked. */
export async function completeVirtualMeeting(member, id, { chosenPlan = null }, actor) {
  const { rows } = await query(
    `UPDATE virtual_meetings SET status = 'completed', completed_at = now(), chosen_plan = COALESCE($3, chosen_plan)
      WHERE id = $1 AND member_id = $2 AND status = 'started' RETURNING id, appointment_id`,
    [id, member.id, chosenPlan],
  );
  if (!rows[0]) throw new NotFoundError('No open meeting');
  await query(`UPDATE appointments SET status = 'completed' WHERE id = $1`, [rows[0].appointment_id]);
  await audit({ actorUserId: actor.userId, actorRole: actor.role, action: 'consultation.completed', entityType: 'appointment', entityId: rows[0].appointment_id, metadata: { via: 'virtual', chosenPlan }, ...actor.reqMeta });
  return { id: rows[0].id, status: 'completed' };
}

/** Deterministic, copy-gated agenda. Every line comes from the member's own file. */
export function buildAgenda({ member, readiness, credit, plans, rec, intake, score = null }) {
  const name = (member.name || '').split(' ')[0] || 'there';
  const t = readiness.today;
  const steps = [];
  steps.push({ key: 'hello', title: 'Welcome', say: `Hi ${name}, I am ${COUNSELOR.name}, ${COUNSELOR.title}. ${COUNSELOR.disclosure} We have about twenty minutes together. Here is the order: your credit, where you stand with lenders today, how the program works, and then your plan.` });

  if (credit.hasReport) {
    const dis = credit.disputable.length; const acc = credit.accurate.length;
    steps.push({ key: 'credit', title: 'Your credit file', screen: '/credit', say: `Your report is on file. I see ${dis + acc} accounts. ${dis} look inaccurate or incomplete, and those are yours to question if you choose; I prepare the letters, you send them. ${acc} report correctly, and the move there is paying balances down, not disputing.${score ? ` Your score today is ${score}. I will explain what moves it.` : ''}` });
    for (const item of credit.disputable.slice(0, 4)) {
      steps.push({ key: `item:${item.id}`, title: item.creditor, screen: `/credit/items/${item.id}`, say: `${item.creditor}, ${item.type}, reported balance ${money(item.balance) ?? 'not listed'}. ${item.guidance_text ?? 'Open the item after our meeting to read why it is flagged.'}` });
    }
  } else {
    steps.push({ key: 'credit', title: 'Your credit file', screen: '/smartcredit', say: 'Your credit report has not reached us yet. Once your monitoring account finishes setting up, I read every line and we go through it together in the app.' });
  }

  const ready = readiness.programs.filter((p) => p.ready).map((p) => p.name);
  const gaps = readiness.programs.filter((p) => !p.ready);
  steps.push({ key: 'standing', title: 'Where you stand today', screen: '/readiness', say: `${t.headline} ${ready.length ? `On paper you already meet the basic marks for ${ready.join(' and ')}.` : ''} ${gaps.map((p) => `For ${p.name}: ${p.gaps.filter((g) => !g.info).map((g) => g.text).join(' ')}`).join(' ')} ${t.estimatedMaxPrice ? `Your estimated price range today is up to ${money(t.estimatedMaxPrice)}${intake?.target_area ? ` around ${intake.target_area}` : ''}.` : ''}`.replace(/\s+/g, ' ').trim() });

  steps.push({ key: 'how', title: 'How the program works', say: 'You get a plan with six tracks: credit, budget, savings, education, readiness, and timeline. Short lessons on a schedule you approve. A budget wired to your bank. Your credit monitored every month. You do the work and stay in control; I stay with you the whole way, and a live specialist is one tap away.' });

  const horizon = readiness.horizons.map((h) => `${h.months} months: ${h.programsWithinReach.length ? h.programsWithinReach.map((c) => c.toUpperCase()).join(', ') + ' within reach' : 'still building'}`).join('. ');
  const recPlans = rec.map((c) => plans.find((p) => p.code === c)).filter(Boolean);
  steps.push({ key: 'plans', title: 'Your two best plans', screen: '/plans', kind: 'plans', recommended: rec, say: `Three plans exist: Steady at twelve months, Focused at nine, Express at six. Based on your credit and file today, the two that fit you are ${recPlans.map((p) => `${p.name}, ${p.targetMonths} months at $${(p.priceCents / 100).toFixed(0)} a month`).join(', and ')}. ${horizon}. Pick one now and we set up your monthly draft before you leave this room; you can cancel any time.` });

  for (const s of steps) if (!checkCopy(s.say).ok) s.say = `${s.title}. Open this screen for the details, and ask your specialist about anything specific to your situation.`;
  return steps;
}
