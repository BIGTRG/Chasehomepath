/**
 * Readiness and recommendation engine (Deon, 2026-09-12).
 *
 * Pure function: inputs in, assessment out. No I/O. Everything it says is an
 * ESTIMATE from published program rules; the copy in the UI says so. It never
 * promises approval, a score, or a date.
 *
 * Rules and sources (verified live 2026-09-13):
 *  FHA   HUD ML 2025-23: 2026 one-unit floor $541,287. HUD 4000.1: 580+ -> 3.5% down;
 *        500-579 -> 10% down. Ratios 31/43 standard; up to 40/50 with compensating factors.
 *  USDA  HB-1-3555: no program score floor; GUS "Accept" generally needs 640+; ratios 29/41
 *        (waivable). Income <= 115% AMI: NC most counties $122,800 (1-4 person),
 *        Raleigh-Cary MSA $152,600 (FY2026, PN 657, eff. 2026-07-13). Rural-eligible property. 0% down.
 *  Conv  Fannie Mae: 620 minimum removed for DU casefiles on/after 2025-11-16 (risk-based);
 *        lenders commonly still overlay 620. 3% down first-time (97% LTV / HomeReady).
 *        DTI 36% baseline, 45% with strong credit/reserves, DU up to 50%.
 *  Rate  Assumed 30-year fixed used only to size a payment; refreshed in config, not a quote.
 */

export const RULES = Object.freeze({
  asOf: '2026-09-13',
  assumedRate: 0.0675, // sizing assumption only; UI labels it as such
  taxInsuranceFactor: 0.0125 / 12, // ~1.25%/yr property tax+insurance, monthly, of price
  closingCostPct: 0.03,
  fha: { floorLoanLimit: 541287, minScore35: 580, minScore10: 500, downLow: 0.035, downHigh: 0.10, frontDti: 0.31, backDti: 0.43, backDtiMax: 0.50, mipAnnual: 0.0055, upfrontMip: 0.0175 },
  usda: { gusScore: 640, frontDti: 0.29, backDti: 0.41, incomeLimit14: 122800, incomeLimit14Raleigh: 152600, incomeLimit58: 162100, incomeLimit58Raleigh: 201450, down: 0, guaranteeFeeAnnual: 0.0035 },
  conventional: { commonOverlayScore: 620, down: 0.03, backDti: 0.45, backDtiMax: 0.50, pmiAnnualEstimate: 0.006 },
});

const RALEIGH_MSA = /raleigh|cary|wake|johnston|franklin/i;

/** Monthly P&I on a fixed-rate loan. */
export function monthlyPI(principal, annualRate, years = 30) {
  const r = annualRate / 12;
  const n = years * 12;
  if (principal <= 0) return 0;
  return (principal * r) / (1 - Math.pow(1 + r, -n));
}

/** Largest price whose all-in payment fits the back-end DTI given monthly debts. */
export function maxPriceForDti({ monthlyIncome, monthlyDebts, backDti, downPct, rate, extraAnnualPct = 0 }) {
  const room = monthlyIncome * backDti - monthlyDebts;
  if (room <= 0) return 0;
  // payment(price) = PI(price*(1-down)) + price*taxIns + price*(1-down)*extra/12 ; solve linearly via unit price.
  const unitLoan = 1 - downPct;
  const perDollar = monthlyPI(unitLoan, rate) + RULES.taxInsuranceFactor + (unitLoan * extraAnnualPct) / 12;
  return Math.floor(room / perDollar / 1000) * 1000;
}

/**
 * @param {object} i
 * @param {number|null} i.creditScore
 * @param {number|null} i.annualIncome       gross household
 * @param {number}      i.monthlyDebts       minimum payments on existing debt
 * @param {number}      i.savings            liquid savings toward the purchase
 * @param {number}      i.householdSize
 * @param {string|null} i.targetArea
 * @param {number}      i.disputableItems
 * @param {number}      i.collections        collection/charge-off tradelines
 * @param {number}      i.revolvingBalance   total revolving balance
 * @param {object}      i.docs               { taxReturns: 0-2, w2s: 0-2, payStubs: 0-2, photoId: bool, bankLinked: bool }
 * @param {number}      i.planDay
 */
export function assess(i) {
  const income = Number(i.annualIncome) || 0;
  const monthlyIncome = income / 12;
  const score = i.creditScore ?? null;
  const debts = Number(i.monthlyDebts) || 0;
  const savings = Number(i.savings) || 0;
  const raleigh = RALEIGH_MSA.test(i.targetArea || '');
  const hh = i.householdSize || 1;
  const usdaLimit = hh <= 4 ? (raleigh ? RULES.usda.incomeLimit14Raleigh : RULES.usda.incomeLimit14) : (raleigh ? RULES.usda.incomeLimit58Raleigh : RULES.usda.incomeLimit58);
  const dti = monthlyIncome > 0 ? debts / monthlyIncome : null;

  const programs = [];

  // FHA
  {
    const gaps = [];
    let downPct = RULES.fha.downLow;
    if (score == null) gaps.push({ code: 'no_score', text: 'We need your credit report on file to check FHA eligibility.' });
    else if (score < RULES.fha.minScore10) gaps.push({ code: 'score', text: `FHA needs a score of at least ${RULES.fha.minScore10} (10% down) or ${RULES.fha.minScore35} (3.5% down). You are at ${score}.`, need: RULES.fha.minScore35 - score });
    else if (score < RULES.fha.minScore35) { downPct = RULES.fha.downHigh; gaps.push({ code: 'score_soft', text: `At ${score} FHA requires 10% down. Reaching ${RULES.fha.minScore35} drops that to 3.5%.`, need: RULES.fha.minScore35 - score }); }
    if (dti != null && dti > RULES.fha.backDtiMax) gaps.push({ code: 'dti', text: `Your existing debt uses ${Math.round(dti * 100)}% of income before a mortgage. FHA tops out near ${Math.round(RULES.fha.backDtiMax * 100)}% all-in.` });
    if (i.collections > 0) gaps.push({ code: 'collections', text: `${i.collections} collection or charge-off account${i.collections > 1 ? 's' : ''} on file. FHA may require these resolved or a payment plan.` });
    const maxPrice = monthlyIncome > 0 && score != null && score >= RULES.fha.minScore10
      ? Math.min(maxPriceForDti({ monthlyIncome, monthlyDebts: debts, backDti: RULES.fha.backDti, downPct, rate: RULES.assumedRate, extraAnnualPct: RULES.fha.mipAnnual }), Math.floor(RULES.fha.floorLoanLimit / (1 - downPct)))
      : 0;
    const cashNeeded = maxPrice > 0 ? Math.round(maxPrice * (downPct + RULES.closingCostPct)) : null;
    if (cashNeeded != null && savings < cashNeeded) gaps.push({ code: 'cash', text: `About $${cashNeeded.toLocaleString()} needed for ${Math.round(downPct * 100 * 10) / 10}% down plus closing costs at that price; $${Math.round(savings).toLocaleString()} saved so far.`, need: cashNeeded - savings });
    programs.push({ code: 'fha', name: 'FHA', downPct, maxPrice, cashNeeded, gaps, ready: gaps.filter((g) => g.code !== 'score_soft').length === 0 && maxPrice > 0 });
  }

  // USDA
  {
    const gaps = [];
    if (income > usdaLimit) gaps.push({ code: 'income', text: `USDA household income limit here is $${usdaLimit.toLocaleString()}; yours is above it.`, hard: true });
    if (score == null) gaps.push({ code: 'no_score', text: 'Credit report needed.' });
    else if (score < RULES.usda.gusScore) gaps.push({ code: 'score', text: `USDA automated approval generally needs ${RULES.usda.gusScore}+. You are at ${score}; below that is a manual underwrite with tighter rules.`, need: RULES.usda.gusScore - score });
    gaps.push({ code: 'location', text: 'The home must be in a USDA-eligible (rural) area. Most of Raleigh proper is not; many surrounding towns are.', info: true });
    if (i.collections > 0) gaps.push({ code: 'collections', text: 'Open collections usually need to be resolved for a USDA manual underwrite.' });
    const eligibleIncome = income > 0 && income <= usdaLimit;
    const maxPrice = eligibleIncome && score != null ? maxPriceForDti({ monthlyIncome, monthlyDebts: debts, backDti: RULES.usda.backDti, downPct: 0, rate: RULES.assumedRate, extraAnnualPct: RULES.usda.guaranteeFeeAnnual }) : 0;
    const cashNeeded = maxPrice > 0 ? Math.round(maxPrice * RULES.closingCostPct) : null;
    if (cashNeeded != null && savings < cashNeeded) gaps.push({ code: 'cash', text: `No down payment, but about $${cashNeeded.toLocaleString()} in closing costs (often negotiable with the seller).`, need: cashNeeded - savings });
    programs.push({ code: 'usda', name: 'USDA Rural', downPct: 0, maxPrice, cashNeeded, gaps, ready: eligibleIncome && score != null && score >= RULES.usda.gusScore && i.collections === 0 && (cashNeeded == null || savings >= cashNeeded) && maxPrice > 0 });
  }

  // Conventional
  {
    const gaps = [];
    if (score == null) gaps.push({ code: 'no_score', text: 'Credit report needed.' });
    else if (score < RULES.conventional.commonOverlayScore) gaps.push({ code: 'score', text: `Most lenders want ${RULES.conventional.commonOverlayScore}+ for conventional. You are at ${score}.`, need: RULES.conventional.commonOverlayScore - score });
    if (dti != null && dti > RULES.conventional.backDtiMax) gaps.push({ code: 'dti', text: `Existing debt is ${Math.round(dti * 100)}% of income; conventional caps near ${Math.round(RULES.conventional.backDtiMax * 100)}% all-in.` });
    const maxPrice = monthlyIncome > 0 && score != null && score >= RULES.conventional.commonOverlayScore
      ? maxPriceForDti({ monthlyIncome, monthlyDebts: debts, backDti: RULES.conventional.backDti, downPct: RULES.conventional.down, rate: RULES.assumedRate, extraAnnualPct: RULES.conventional.pmiAnnualEstimate }) : 0;
    const cashNeeded = maxPrice > 0 ? Math.round(maxPrice * (RULES.conventional.down + RULES.closingCostPct)) : null;
    if (cashNeeded != null && savings < cashNeeded) gaps.push({ code: 'cash', text: `About $${cashNeeded.toLocaleString()} for 3% down plus closing costs.`, need: cashNeeded - savings });
    programs.push({ code: 'conventional', name: 'Conventional 3% down', downPct: RULES.conventional.down, maxPrice, cashNeeded, gaps, ready: gaps.length === 0 && maxPrice > 0 });
  }

  // Documents
  const docGaps = [];
  if (!i.docs?.photoId) docGaps.push('Photo ID');
  if ((i.docs?.payStubs ?? 0) < 2) docGaps.push('Two recent pay stubs');
  if ((i.docs?.w2s ?? 0) < 2) docGaps.push('W-2s, two years');
  if ((i.docs?.taxReturns ?? 0) < 2) docGaps.push('Tax returns, two years');
  if (!i.docs?.bankLinked) docGaps.push('Bank account linked');

  // Training: base curriculum plus extra when credit is weak or debt is high.
  const training = [];
  if (score == null || score < 620 || i.collections > 0 || i.disputableItems > 2) {
    training.push({ code: 'credit_deep_dive', title: 'Credit deep dive: how scores are built and rebuilt', reason: score == null ? 'No report yet' : `Score ${score}${i.collections ? `, ${i.collections} collection(s)` : ''}` });
  }
  if (score != null && score < 580) training.push({ code: 'rebuild_plan', title: 'Rebuilding from below 580: the 12-month method', reason: 'Below FHA 3.5% threshold' });
  if (dti != null && dti > 0.35) training.push({ code: 'debt_paydown', title: 'Paying down debt in the right order', reason: `Debt is ${Math.round(dti * 100)}% of income` });
  if (i.revolvingBalance > 0 && monthlyIncome > 0 && i.revolvingBalance > monthlyIncome) training.push({ code: 'utilization', title: 'Credit utilization: the fastest lever you control', reason: 'Revolving balances above one month of income' });
  if (savings < 2000) training.push({ code: 'saving_system', title: 'A savings system that survives real life', reason: 'Under $2,000 saved' });

  // Where you stand today
  const bestReady = programs.find((p) => p.ready);
  const bestPrice = Math.max(...programs.map((p) => p.maxPrice));
  const scoreGaps = programs.flatMap((p) => p.gaps.filter((g) => g.need && (g.code === 'score' || g.code === 'score_soft')).map((g) => g.need));
  const cashGaps = programs.flatMap((p) => p.gaps.filter((g) => g.need && g.code === 'cash').map((g) => g.need));
  const smallestScoreGap = scoreGaps.length ? Math.min(...scoreGaps) : 0;
  const smallestCashGap = cashGaps.length ? Math.min(...cashGaps) : 0;

  // Projection at 6/9/12 months: illustrative ranges from the levers in the plan, not predictions.
  const monthlySave = monthlyIncome > 0 ? Math.round(monthlyIncome * 0.10) : 0;
  const scoreLift = (months) => {
    if (score == null) return null;
    let low = 0, high = 0;
    if (i.disputableItems > 0) { low += 0; high += Math.min(40, i.disputableItems * 12); }
    if (i.revolvingBalance > 0) { low += 10; high += 45; }
    if (i.collections > 0) { low += 0; high += 25; }
    low += Math.round(months * 1.5); high += Math.round(months * 4); // on-time history
    return { low: Math.min(score + low, 850), high: Math.min(score + high, 850) };
  };
  const horizons = [6, 9, 12].map((months) => {
    const s = scoreLift(months);
    const cash = savings + monthlySave * months;
    const readyPrograms = programs.filter((p) => {
      const scoreOk = s ? (p.code === 'fha' ? s.high >= RULES.fha.minScore35 : p.code === 'usda' ? s.high >= RULES.usda.gusScore : s.high >= RULES.conventional.commonOverlayScore) : false;
      const cashOk = p.cashNeeded == null ? false : cash >= p.cashNeeded;
      const hardBlock = p.gaps.some((g) => g.hard);
      return scoreOk && cashOk && !hardBlock && p.maxPrice > 0;
    }).map((p) => p.code);
    return { months, scoreRange: s, projectedSavings: Math.round(cash), programsWithinReach: readyPrograms, docsDone: docGaps.length === 0 || months >= 6 };
  });

  // Recommended pace: the shortest horizon where at least one program comes within reach; else Steady.
  const firstReach = horizons.find((h) => h.programsWithinReach.length > 0);
  const recommendedPlan = !firstReach ? 'steady' : firstReach.months === 6 ? 'express' : firstReach.months === 9 ? 'focused' : 'steady';
  const readyNow = Boolean(bestReady) && docGaps.length === 0 && (i.planDay ?? 0) >= 90;

  return {
    asOf: RULES.asOf,
    assumptions: { rate: RULES.assumedRate, monthlySavingsAssumed: monthlySave, usdaIncomeLimit: usdaLimit },
    inputs: { creditScore: score, annualIncome: income, monthlyDebts: debts, savings, householdSize: hh, targetArea: i.targetArea ?? null, disputableItems: i.disputableItems, collections: i.collections, dti: dti == null ? null : Math.round(dti * 100) / 100 },
    today: {
      readyNow,
      headline: readyNow ? 'You meet the basic marks. Your specialist can start the lender conversation.'
        : bestReady ? 'You meet program marks on paper; finish training, documents, and the 90-day window first.'
          : 'Not ready yet, and that is normal. Here is exactly what stands between you and a lender.',
      estimatedMaxPrice: bestPrice > 0 ? bestPrice : null,
      smallestScoreGap, smallestCashGap,
      documentGaps: docGaps,
    },
    programs,
    training,
    horizons,
    recommendedPlan,
    disclaimer: 'Estimates from published FHA, USDA, and Fannie Mae guidelines as of ' + RULES.asOf + '. Not a loan offer, pre-approval, or prediction. Lenders make credit decisions.',
  };
}
