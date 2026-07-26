/**
 * Marketplace estimates (spec §7, §4.14–15) — deterministic, clearly ESTIMATES.
 * These illustrate affordability; they are not quoted rates or financing promises.
 * (Rate/term questions escalate to a licensed human — see the AI agent, Phase 9.)
 */

// Illustrative assumptions for estimates only. Real terms come from a lender.
export const ILLUSTRATIVE_APR = 0.065; // 6.5% — illustrative, not a quote
export const TERM_MONTHS = 360; // 30-year
export const DEFAULT_DOWN_PCT = 0.03; // low down-payment path
const TAX_INS_ANNUAL_RATE = 0.0125; // ~property tax + insurance, of price/value

/** Standard amortized principal & interest for a financed amount. */
export function principalAndInterest(financedAmount, apr = ILLUSTRATIVE_APR, months = TERM_MONTHS) {
  const amt = Number(financedAmount);
  if (!(amt > 0)) return 0;
  const r = apr / 12;
  if (r === 0) return amt / months;
  return (amt * r) / (1 - Math.pow(1 + r, -months));
}

/**
 * Estimated monthly payment for a total price, after an assistance credit reduces the
 * amount financed. Includes a rough tax+insurance escrow. Returns a rounded dollar figure.
 */
export function estimatedMonthly(price, { assistance = 0, downPct = DEFAULT_DOWN_PCT } = {}) {
  const p = Number(price);
  if (!(p > 0)) return null;
  const down = p * downPct;
  const financed = Math.max(0, p - down - Number(assistance || 0));
  const pi = principalAndInterest(financed);
  const escrow = (p * TAX_INS_ANNUAL_RATE) / 12;
  return Math.round(pi + escrow);
}

/**
 * Deterministic lot ↔ house-plan fit (spec §3 lot_plan_fit). A plan fits a lot when the
 * lot has enough room for the footprint plus yard/setbacks, and foundations are compatible.
 * Returns { fits, reason }.
 */
export function evaluateFit(lot, plan) {
  const reasons = [];
  let fits = true;

  const lotSqft = Number(lot.sqft ?? 0);
  const planSqft = Number(plan.sqft ?? 0);
  // Rough rule: a single-story footprint plus yard/setbacks needs ~2.5× the plan's sqft.
  const needed = planSqft * 2.5;
  if (lotSqft > 0 && planSqft > 0) {
    if (lotSqft >= needed) {
      reasons.push(`Lot (${lotSqft.toLocaleString()} sqft) fits the ${planSqft.toLocaleString()} sqft plan with room for setbacks.`);
    } else {
      fits = false;
      reasons.push(`Lot (${lotSqft.toLocaleString()} sqft) is tight for the ${planSqft.toLocaleString()} sqft plan.`);
    }
  }

  if (lot.foundation && plan.foundation && lot.foundation !== plan.foundation) {
    fits = false;
    reasons.push(`Foundation mismatch: lot suits ${lot.foundation}, plan needs ${plan.foundation}.`);
  }

  return { fits, reason: reasons.join(' ') };
}

/** All-in cost for building a plan on a lot: lot price + midpoint build estimate. */
export function allInCost(lot, plan) {
  const lotPrice = Number(lot.price ?? 0);
  const low = Number(plan.est_build_low ?? 0);
  const high = Number(plan.est_build_high ?? 0);
  const build = low && high ? (low + high) / 2 : high || low;
  return Math.round(lotPrice + build);
}
