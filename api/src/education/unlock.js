/**
 * Education unlock evaluator (spec §6 lock/unlock conditions) — pure and deterministic.
 * A module_assignment carries a data-driven `unlock_condition`; this decides whether it
 * is available given the member's current plan state. "Locked until relevant" (spec §4.13).
 *
 * Supported condition keys (all optional; all must pass):
 *   minPlanDay:        number  — plan_day must be >= this
 *   requiresPlanStatus:string  — plan.status must equal this (e.g. 'completed' for "after you own it")
 *   requiresTrack:     { track, minPct } — that track's progress must be >= minPct
 */
export function isUnlocked(condition, ctx) {
  if (!condition || typeof condition !== 'object') return true;

  if (condition.minPlanDay != null && Number(ctx.planDay) < Number(condition.minPlanDay)) return false;

  if (condition.requiresPlanStatus && ctx.planStatus !== condition.requiresPlanStatus) return false;

  if (condition.requiresTrack) {
    const { track, minPct } = condition.requiresTrack;
    const pct = ctx.trackProgress?.[track] ?? 0;
    if (Number(pct) < Number(minPct ?? 0)) return false;
  }
  return true;
}

/** Default unlock condition for a module based on its curriculum phase. */
export function defaultConditionForPhase(phase) {
  switch (phase) {
    case 'before':
      return { minPlanDay: 0 };
    case 'during':
      return { minPlanDay: 45 };
    case 'after':
      return { requiresPlanStatus: 'completed' }; // unlocks in homeowner mode (Phase 13)
    default:
      return {};
  }
}
