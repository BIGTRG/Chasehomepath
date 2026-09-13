import { query } from '../db/pool.js';
import { assess } from '../readiness/engine.js';
import { getCreditOverview } from './credit.service.js';
import { audit } from '../lib/audit.js';

/**
 * Assemble the member's own data for the readiness engine, run it, and keep the
 * curriculum in step (extra credit/debt training when the engine says so).
 * Reads: intake (income, area, co-applicant), credit report (score + items),
 * documents, savings goals, bank link, plan day.
 */
const EXTRA_MODULES = {
  credit_deep_dive: { title: 'Credit deep dive: how scores are built and rebuilt', phase: 'before', duration_min: 18, content_ref: 'mod/before/credit-deep-dive' },
  rebuild_plan: { title: 'Rebuilding from below 580: the 12-month method', phase: 'before', duration_min: 20, content_ref: 'mod/before/rebuild-580' },
  debt_paydown: { title: 'Paying down debt in the right order', phase: 'before', duration_min: 12, content_ref: 'mod/before/debt-paydown' },
  utilization: { title: 'Credit utilization: the fastest lever you control', phase: 'before', duration_min: 9, content_ref: 'mod/before/utilization' },
  saving_system: { title: 'A savings system that survives real life', phase: 'before', duration_min: 10, content_ref: 'mod/before/saving-system' },
};

export async function gatherInputs(member) {
  const [intake, credit, docs, savings, bank, debts] = await Promise.all([
    query(`SELECT household_income, target_area, co_applicant FROM intake_profiles WHERE member_id = $1 AND deleted_at IS NULL`, [member.id]).then((r) => r.rows[0] ?? null),
    getCreditOverview(member),
    query(`SELECT doc_type FROM member_documents WHERE member_id = $1 AND deleted_at IS NULL`, [member.id]).then((r) => r.rows.map((x) => x.doc_type)),
    query(`SELECT COALESCE(SUM(current_amount),0)::numeric AS s FROM savings_goals WHERE member_id = $1 AND deleted_at IS NULL`, [member.id]).then((r) => Number(r.rows[0].s)),
    query(`SELECT 1 FROM bank_links WHERE member_id = $1 AND status = 'active' AND deleted_at IS NULL LIMIT 1`, [member.id]).then((r) => r.rows.length > 0),
    query(`SELECT COALESCE(SUM(monthly_target),0)::numeric AS d FROM budget_targets WHERE member_id = $1 AND deleted_at IS NULL AND category IN ('debt','loans','credit_cards')`, [member.id]).then((r) => Number(r.rows[0].d)).catch(() => 0),
  ]);
  const items = [...credit.disputable, ...credit.accurate];
  const revolving = items.filter((x) => /revolv|card/i.test(x.type || '')).reduce((a, x) => a + Number(x.balance || 0), 0);
  const installment = items.filter((x) => /install|auto|student|loan/i.test(x.type || '')).reduce((a, x) => a + Number(x.balance || 0), 0);
  const collections = items.filter((x) => /collect|charge/i.test(x.type || '')).length;
  // Minimum-payment estimate when no budget line exists: 3% of revolving + 1.5% of installment balances.
  const monthlyDebts = debts > 0 ? debts : Math.round(revolving * 0.03 + installment * 0.015);
  const co = intake?.co_applicant ?? null;
  const householdSize = 1 + (co ? 1 : 0) + (Number(co?.dependents) || 0);
  return {
    creditScore: credit.score && !credit.score.withheld ? credit.score.value : null,
    scoreWithheld: Boolean(credit.score?.withheld),
    annualIncome: intake?.household_income ? Number(intake.household_income) : null,
    monthlyDebts, savings, householdSize, targetArea: intake?.target_area ?? null,
    disputableItems: credit.disputable.length, collections, revolvingBalance: revolving,
    docs: {
      photoId: docs.includes('photo_id'), bankLinked: bank,
      payStubs: ['pay_stub_1', 'pay_stub_2'].filter((d) => docs.includes(d)).length,
      w2s: ['w2_1', 'w2_2'].filter((d) => docs.includes(d)).length,
      taxReturns: ['tax_return_1', 'tax_return_2'].filter((d) => docs.includes(d)).length,
    },
    planDay: member.plan_day ?? 0,
  };
}

export async function readinessForMember(member, actor) {
  const inputs = await gatherInputs(member);
  const result = assess(inputs);
  await syncTraining(member.id, result.training);
  if (actor) {
    await audit({ actorUserId: actor.userId, actorRole: actor.role, action: 'readiness.assessed', entityType: 'member', entityId: member.id, metadata: { recommendedPlan: result.recommendedPlan, readyNow: result.today.readyNow } });
  }
  return { ...result, scoreWithheld: inputs.scoreWithheld };
}

/** Ensure recommended extra modules exist and are assigned (available now). Never removes progress. */
async function syncTraining(memberId, training) {
  for (const t of training) {
    const def = EXTRA_MODULES[t.code];
    if (!def) continue;
    const { rows } = await query(
      `INSERT INTO modules (title, phase, duration_min, content_ref) VALUES ($1,$2,$3,$4)
       ON CONFLICT (content_ref) WHERE deleted_at IS NULL DO NOTHING RETURNING id`,
      [def.title, def.phase, def.duration_min, def.content_ref],
    );
    let moduleId = rows[0]?.id;
    if (!moduleId) moduleId = (await query(`SELECT id FROM modules WHERE content_ref = $1 AND deleted_at IS NULL LIMIT 1`, [def.content_ref])).rows[0]?.id;
    if (!moduleId) continue;
    await query(
      `INSERT INTO module_assignments (member_id, module_id, status, unlock_condition) VALUES ($1,$2,'available','{"reason":"readiness"}')
       ON CONFLICT (member_id, module_id) WHERE deleted_at IS NULL DO NOTHING`,
      [memberId, moduleId],
    );
  }
}
