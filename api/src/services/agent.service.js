import { query } from '../db/pool.js';
import { audit } from '../lib/audit.js';
import { checkCopy } from '../compliance/copyGate.js';
import { detectEscalation, escalationMessage } from '../ai/escalation.js';
import { getAnthropicAdapter } from '../integrations/anthropic/index.js';
import { MIN_PLAN_DAY_FOR_PLACEMENT, canBePlacementReady } from '../compliance/rules.js';

const SYSTEM_PROMPT =
  'You are the CHASE HomePath member assistant. Answer ONLY from the member’s own file. ' +
  'Never promise an outcome, score change, or approval timeline. Never reveal another member’s data. ' +
  'For questions about mortgage rates, loan terms, or legal advice, defer to the licensed team.';

/**
 * Build the agent's context from the requesting member's OWN data only (spec §7.2:
 * "Never surface another member's data"). Everything here is scoped by member id.
 */
async function buildMemberContext(memberId) {
  const { rows: planRows } = await query(
    `SELECT GREATEST(0, (CURRENT_DATE - m.join_date))::int AS plan_day
       FROM members m WHERE m.id = $1`,
    [memberId],
  );
  const planDay = planRows[0]?.plan_day ?? 0;

  const { rows: creditRows } = await query(
    `SELECT ci.classification, COUNT(*)::int AS n
       FROM credit_items ci
       JOIN credit_reports cr ON cr.id = ci.report_id
      WHERE cr.member_id = $1 AND ci.deleted_at IS NULL
      GROUP BY ci.classification`,
    [memberId],
  );
  const credit = creditRows.length
    ? {
        disputable: creditRows.find((r) => r.classification === 'disputable')?.n ?? 0,
        accurate: creditRows.find((r) => r.classification === 'accurate')?.n ?? 0,
      }
    : null;

  const { rows: disputeRows } = await query(
    `SELECT COUNT(*)::int AS n FROM disputes
      WHERE member_id = $1 AND status IN ('draft','filed','investigating') AND deleted_at IS NULL`,
    [memberId],
  );
  const { rows: savingsRows } = await query(
    `SELECT COUNT(*)::int AS n FROM savings_goals WHERE member_id = $1 AND deleted_at IS NULL`,
    [memberId],
  );

  return {
    planDay,
    placementEligible: canBePlacementReady(planDay),
    daysToPlacement: Math.max(0, MIN_PLAN_DAY_FOR_PLACEMENT - planDay),
    credit,
    openDisputes: disputeRows[0].n,
    savingsGoals: savingsRows[0].n,
  };
}

/**
 * Answer a member question. Escalation is checked FIRST (deterministic) and, when it
 * fires, the model is never called. Model output is copy-gated before returning.
 */
export async function answerQuestion(member, question, actor) {
  const escalation = detectEscalation(question);
  if (escalation.escalate) {
    await audit({ actorUserId: actor.userId, actorRole: actor.role, action: 'agent.escalated', entityType: 'member', entityId: member.id, metadata: { topic: escalation.topic }, ...actor.reqMeta });
    return { escalated: true, topic: escalation.topic, answer: escalationMessage(escalation.topic) };
  }

  const context = await buildMemberContext(member.id);
  const { text } = await getAnthropicAdapter().complete({ system: SYSTEM_PROMPT, context, question });

  // Copy gate: never let a promissory answer through. If flagged, fall back to a safe reply.
  let answer = text;
  let gated = false;
  if (!checkCopy(text).ok) {
    gated = true;
    answer =
      "Here's what your file shows at a high level. For anything about specific outcomes or " +
      'timelines, your assigned specialist is the right person to talk to.';
  }

  await audit({ actorUserId: actor.userId, actorRole: actor.role, action: 'agent.answered', entityType: 'member', entityId: member.id, metadata: { gated }, ...actor.reqMeta });
  return { escalated: false, answer };
}
