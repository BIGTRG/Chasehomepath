import { assertCleanCopy } from '../compliance/copyGate.js';

/**
 * Money coaching (spec §4.11: "specific coaching") — deterministic, specific, and
 * non-promissory. Given budgets vs actual spend and savings-goal progress, it produces
 * concrete, prioritized suggestions. It never promises an outcome (all copy passes the
 * no-outcome-promises gate).
 *
 * @param {{category, monthly_target, actual}[]} budgets
 * @param {{label, target_amount, current_amount}[]} savings
 * @returns {{type, category?, severity, message}[]}
 */
export function buildCoaching(budgets = [], savings = []) {
  const tips = [];

  for (const b of budgets) {
    const target = Number(b.monthly_target ?? 0);
    const actual = Number(b.actual ?? 0);
    if (target <= 0) continue;
    const over = actual - target;
    if (over > 0) {
      tips.push({
        type: 'over_budget',
        category: b.category,
        severity: over / target >= 0.25 ? 'high' : 'medium',
        message:
          `You're over your ${money(target)} ${b.category} budget this month by ${money(over)}. ` +
          `Trimming here frees up money you can move toward savings.`,
        over,
      });
    } else if (actual > 0 && actual / target <= 0.6) {
      tips.push({
        type: 'under_budget',
        category: b.category,
        severity: 'low',
        message: `Nice — you're well under your ${b.category} budget. Consider moving the difference into savings.`,
        over,
      });
    }
  }

  for (const g of savings) {
    const target = Number(g.target_amount ?? 0);
    const current = Number(g.current_amount ?? 0);
    if (target <= 0) continue;
    const pct = Math.min(100, Math.round((current / target) * 100));
    if (pct >= 100) {
      tips.push({ type: 'goal_met', category: g.label, severity: 'low', message: `You've reached your "${g.label}" goal. Talk with your specialist about what's next.` });
    } else {
      tips.push({
        type: 'savings_progress',
        category: g.label,
        severity: pct < 25 ? 'medium' : 'low',
        message: `Your "${g.label}" goal is ${pct}% funded (${money(current)} of ${money(target)}). Steady, regular deposits keep it moving.`,
      });
    }
  }

  // Highest-severity first, capped so the screen stays focused.
  const rank = { high: 0, medium: 1, low: 2 };
  const ordered = tips.sort((a, b) => rank[a.severity] - rank[b.severity]).slice(0, 5);

  // Backstop: no coaching copy may promise an outcome.
  for (const t of ordered) assertCleanCopy(t.message, `coaching (${t.type})`);
  return ordered;
}

function money(n) {
  return `$${Number(n ?? 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}
