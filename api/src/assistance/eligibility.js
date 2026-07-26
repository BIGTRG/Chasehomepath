/**
 * Assistance eligibility evaluator (spec §7.3) — interprets a program's rules_json against
 * a member profile. Rules are DATA, refreshed from source, never hardcoded — so program
 * terms can change without touching code.
 *
 * Supported rules_json keys (all optional):
 *   maxAnnualIncome:      number  — profile.annualIncome must be known and <= this
 *   minCreditScore:       number  — profile.creditScore must be known and >= this
 *   maxPurchasePrice:     number  — if profile.purchasePrice known, must be <= this
 *   firstTimeBuyerRequired: bool   — requires profile.firstTimeBuyer === true
 *   amount:               number  — flat assistance amount when eligible
 *   amountPctOfPrice:     number  — % of purchase price (0..1) when eligible
 */
export function evaluateEligibility(rules = {}, profile = {}) {
  const reasons = [];
  let eligible = true;

  if (rules.maxAnnualIncome != null) {
    if (profile.annualIncome == null) { eligible = false; reasons.push('income unknown'); }
    else if (profile.annualIncome > rules.maxAnnualIncome) { eligible = false; reasons.push('income above limit'); }
  }

  if (rules.minCreditScore != null) {
    if (profile.creditScore == null) { eligible = false; reasons.push('credit score unknown'); }
    else if (profile.creditScore < rules.minCreditScore) { eligible = false; reasons.push('credit score below minimum'); }
  }

  if (rules.maxPurchasePrice != null && profile.purchasePrice != null) {
    if (profile.purchasePrice > rules.maxPurchasePrice) { eligible = false; reasons.push('purchase price above limit'); }
  }

  if (rules.firstTimeBuyerRequired === true && profile.firstTimeBuyer !== true) {
    eligible = false; reasons.push('first-time buyer required');
  }

  let amount = 0;
  if (eligible) {
    const flat = Number(rules.amount ?? 0);
    const pct = rules.amountPctOfPrice != null && profile.purchasePrice != null
      ? Number(rules.amountPctOfPrice) * Number(profile.purchasePrice)
      : 0;
    amount = Math.round(flat + pct);
  }

  return { eligible, amount, reasons };
}
