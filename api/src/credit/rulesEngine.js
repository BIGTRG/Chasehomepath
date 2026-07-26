import { assertCleanCopy } from '../compliance/copyGate.js';

/**
 * Credit rules engine (spec §7.1) — DETERMINISTIC, not generative.
 *
 * Encodes FCRA / CROA dispute grounds as explicit rules and applies them to the
 * member's actual report items. For each item it decides `disputable` vs `accurate`
 * and generates honest guidance. Same input -> same output, always auditable.
 *
 * Hard constraints (enforced here + by callers):
 *  - Never pre-selects a dispute. It only classifies; the member chooses and submits.
 *  - Accuracy-first: an item is only `disputable` when a concrete rule fires. We never
 *    label an accurate item disputable to pad numbers.
 *  - Never promises an outcome, score change, or timeline. Guidance passes the copy gate.
 *
 * A raw item from a bureau adapter may include richer fields than we persist:
 *   { creditor, type, balance, member_recorded_balance, date_opened, last_reported,
 *     first_delinquency_date, recognized (bool), duplicate_of (id|null), past_due }
 */

const SEVEN_YEARS_MS = 7 * 365.25 * 24 * 60 * 60 * 1000;

// Material balance discrepancy threshold: the greater of $50 or 5%.
function balanceIsMaterullyDifferent(reported, recorded) {
  if (reported == null || recorded == null) return false;
  const diff = Math.abs(Number(reported) - Number(recorded));
  if (diff === 0) return false;
  return diff >= 50 || diff / Math.max(1, Number(reported)) >= 0.05;
}

/**
 * Each rule: { id, fcra, test(item, ctx) -> bool, reason(item) -> string }.
 * If ANY rule fires, the item is `disputable`. Order is for reporting only.
 */
export const RULES = [
  {
    id: 'not_recognized',
    fcra: 'FCRA §611 (disputing inaccurate/unverifiable information); possible mixed file or fraud',
    test: (item) => item.recognized === false,
    reason: () =>
      "You indicated you don't recognize this account. Information you believe isn't yours " +
      'can be disputed and must be verified by the furnisher.',
  },
  {
    id: 'balance_mismatch',
    fcra: 'FCRA §611 (disputing inaccurate information)',
    test: (item) => balanceIsMaterullyDifferent(item.balance, item.member_recorded_balance),
    reason: (item) =>
      `The balance you recorded ($${fmt(item.member_recorded_balance)}) differs from the ` +
      `reported balance ($${fmt(item.balance)}). A balance you believe is inaccurate can be disputed.`,
  },
  {
    id: 'obsolete',
    fcra: 'FCRA §605 (7-year reporting limit for most negative items)',
    test: (item, ctx) => {
      if (!item.first_delinquency_date) return false;
      const age = ctx.now - new Date(item.first_delinquency_date).getTime();
      return age > SEVEN_YEARS_MS;
    },
    reason: () =>
      'This item appears older than the 7-year window during which most negative information ' +
      'may be reported. Items past that window can be disputed as obsolete.',
  },
  {
    id: 'duplicate',
    fcra: 'FCRA §611 (inaccurate/duplicate reporting)',
    test: (item) => Boolean(item.duplicate_of),
    reason: () =>
      'This account looks like a duplicate of another tradeline. Duplicate reporting of the ' +
      'same debt can be disputed.',
  },
];

function fmt(n) {
  return Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Rights text shown on every item (spec §4.9: engine explains the member's FCRA rights). */
export const FCRA_RIGHTS = [
  'You have the right to dispute information you believe is inaccurate or incomplete.',
  'The credit bureau must investigate, usually within 30 days, and cannot charge you.',
  'If information is corrected or cannot be verified, it must be updated or removed.',
  'You choose whether to dispute — nothing is filed on your behalf automatically.',
];

/**
 * Classify one raw item. Returns the persisted shape plus reasons/rights for the UI.
 * Never mutates input; never files anything.
 */
export function classifyItem(rawItem, { now = Date.now() } = {}) {
  const ctx = { now };
  const fired = RULES.filter((r) => {
    try {
      return r.test(rawItem, ctx);
    } catch {
      return false;
    }
  });

  const classification = fired.length > 0 ? 'disputable' : 'accurate';

  const guidance =
    classification === 'disputable'
      ? fired.map((r) => r.reason(rawItem)).join(' ')
      : accurateGuidance(rawItem);

  // Backstop: guidance must never promise an outcome (spec §8).
  assertCleanCopy(guidance, `credit item guidance (${classification})`);

  return {
    creditor: rawItem.creditor ?? null,
    type: rawItem.type ?? null,
    balance: rawItem.balance ?? null,
    member_recorded_balance: rawItem.member_recorded_balance ?? null,
    classification,
    guidance_text: guidance,
    // Non-persisted, returned for the item-detail screen:
    reasons: fired.map((r) => ({ id: r.id, fcra: r.fcra, explanation: r.reason(rawItem) })),
    rights: FCRA_RIGHTS,
  };
}

/**
 * Honest paydown/aging guidance for accurate items (spec §4.8: "Accurate items get
 * honest paydown guidance, never filler disputes"). No numbers/promises.
 */
function accurateGuidance(item) {
  const type = (item.type ?? '').toLowerCase();
  if (type.includes('collection')) {
    return (
      'This collection appears to be reported accurately, so a dispute is not the right tool here. ' +
      'Options such as paying or settling the balance are worth discussing with your specialist.'
    );
  }
  if (type.includes('revolving') || type.includes('card')) {
    return (
      'This account appears to be reported accurately. Keeping the balance low relative to the ' +
      'limit and paying on time each month generally supports a healthy credit profile over time.'
    );
  }
  return (
    'This account appears to be reported accurately. Consistent on-time payments and paying the ' +
    'balance down over time generally support a healthy credit profile.'
  );
}

export function classifyReport(rawItems, opts) {
  return rawItems.map((item) => classifyItem(item, opts));
}
