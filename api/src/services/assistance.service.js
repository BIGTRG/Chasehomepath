import { query } from '../db/pool.js';
import { audit } from '../lib/audit.js';
import { decrypt } from '../lib/crypto.js';
import { evaluateEligibility } from '../assistance/eligibility.js';

/**
 * Build the member's eligibility profile from their own data. Credit score here is used
 * internally for matching only — it is NOT rendered to the member before their consultation
 * (that display rule lives in the credit service).
 */
async function buildProfile(memberId, { purchasePrice = null } = {}) {
  // Estimated annual income from the latest month's income transactions.
  const { rows: incomeRows } = await query(
    `SELECT COALESCE(SUM(amount),0)::numeric(14,2) AS monthly_income
       FROM transactions
      WHERE member_id = $1 AND category = 'income' AND deleted_at IS NULL
        AND date_trunc('month', date) = date_trunc('month', CURRENT_DATE)`,
    [memberId],
  );
  const monthlyIncome = Number(incomeRows[0].monthly_income);
  const annualIncome = monthlyIncome > 0 ? Math.round(monthlyIncome * 12) : null;

  // Credit score from the latest report's encrypted raw (internal use).
  const { rows: reportRows } = await query(
    `SELECT raw_ref FROM credit_reports WHERE member_id = $1 AND deleted_at IS NULL
      ORDER BY pulled_at DESC LIMIT 1`,
    [memberId],
  );
  let creditScore = null;
  if (reportRows[0]?.raw_ref) {
    try { creditScore = JSON.parse(decrypt(reportRows[0].raw_ref)).score ?? null; } catch { /* ignore */ }
  }

  return { annualIncome, creditScore, purchasePrice, firstTimeBuyer: true };
}

/**
 * Program matching (spec §7.3): evaluate every active program's rules_json against the
 * member profile and upsert program_matches. Returns the evaluated matches.
 */
export async function evaluateProgramsForMember(member, opts, actor) {
  const profile = await buildProfile(member.id, opts);
  const { rows: programs } = await query(
    `SELECT id, name, source, rules_json FROM assistance_programs WHERE active = true AND deleted_at IS NULL`,
  );

  const results = [];
  for (const program of programs) {
    const { eligible, amount, reasons } = evaluateEligibility(program.rules_json, profile);
    await query(
      `INSERT INTO program_matches (member_id, program_id, eligible, amount, evaluated_at)
       VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (member_id, program_id) WHERE deleted_at IS NULL
       DO UPDATE SET eligible = EXCLUDED.eligible, amount = EXCLUDED.amount, evaluated_at = now()`,
      [member.id, program.id, eligible, amount],
    );
    results.push({ programId: program.id, name: program.name, source: program.source, eligible, amount, reasons });
  }

  if (actor) {
    await audit({ actorUserId: actor.userId, actorRole: actor.role, action: 'assistance.evaluated', entityType: 'member', entityId: member.id, metadata: { count: results.length }, ...actor.reqMeta });
  }
  return results;
}

/** Member-facing: evaluate + return eligible programs and total assistance. */
export async function getAssistanceForMember(member, actor) {
  const all = await evaluateProgramsForMember(member, {}, actor);
  const eligible = all.filter((p) => p.eligible);
  const total = eligible.reduce((sum, p) => sum + Number(p.amount || 0), 0);
  return { programs: all, eligible, total };
}
