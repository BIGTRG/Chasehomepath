import { ComplianceError } from '../lib/errors.js';

/**
 * Load-bearing compliance rules from spec §8, expressed as pure, testable functions.
 * They are enforced in code, not left to staff discretion (spec §8 preamble).
 * Later phases call these; defining them in Phase 1 keeps the rules in one auditable place.
 */

export const MIN_PLAN_DAY_FOR_PLACEMENT = 90;

/**
 * 90-day minimum (§8): no member may be marked placement-ready before plan_day ≥ 90.
 */
export function canBePlacementReady(planDay) {
  return Number(planDay) >= MIN_PLAN_DAY_FOR_PLACEMENT;
}

export function assertPlacementReady(planDay) {
  if (!canBePlacementReady(planDay)) {
    throw new ComplianceError(
      `Member cannot be placement-ready before day ${MIN_PLAN_DAY_FOR_PLACEMENT} ` +
        `(currently day ${planDay}).`,
      '90_day_minimum',
    );
  }
}

/**
 * Score withheld until meeting (§8): the credit score is not rendered in the member
 * app before the first consultation appointment is marked complete.
 */
export function canRenderScore({ firstConsultationCompleted }) {
  return firstConsultationCompleted === true;
}

export function assertScoreVisible(state) {
  if (!canRenderScore(state)) {
    throw new ComplianceError(
      'Credit score is withheld until the first consultation is complete.',
      'score_withheld_until_meeting',
    );
  }
}

/**
 * Onboarding gate (§8): no staff/partner touches a client until their onboarding
 * case stage = 'complete' AND all license records are verified.
 */
export function isOnboardingComplete({ stage, licenses = [] }) {
  if (stage !== 'complete') return false;
  // Every license record present must be verified (active + verified_at set).
  return licenses.every((l) => l.status === 'active' && l.verified_at);
}

export function assertCanTouchClients(state) {
  if (!isOnboardingComplete(state)) {
    throw new ComplianceError(
      'Staff/partner cannot be assigned to clients until onboarding is complete and ' +
        'all licenses are verified.',
      'onboarding_gate',
    );
  }
}

/**
 * Self-directed credit work (§8): a dispute must trace to a member action (a click),
 * never to a system process. Enforced by requiring a human initiator id.
 */
export function assertMemberInitiated(initiatedByUserId) {
  if (!initiatedByUserId) {
    throw new ComplianceError(
      'Disputes must be member-initiated; no system-initiated disputes are allowed.',
      'self_directed_credit_work',
    );
  }
}
