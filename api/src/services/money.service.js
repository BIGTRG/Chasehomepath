import { query, withTransaction } from '../db/pool.js';
import { encrypt } from '../lib/crypto.js';
import { audit } from '../lib/audit.js';
import { NotFoundError } from '../lib/errors.js';
import { getPlaidAdapter } from '../integrations/plaid/index.js';
import { buildCoaching } from '../money/coaching.js';

/** Start a Plaid Link session (returns a link token the client hands to Plaid Link). */
export async function createLinkToken(member) {
  return getPlaidAdapter().createLinkToken(member);
}

/** Exchange the public token from Plaid Link and persist the bank link (token encrypted). */
export async function linkBank(member, publicToken, actor) {
  const adapter = getPlaidAdapter();
  const { itemId, institution } = await adapter.exchangePublicToken(publicToken);

  return withTransaction(async (db) => {
    const { rows } = await db(
      `INSERT INTO bank_links (member_id, plaid_item_id, institution, status)
       VALUES ($1, $2, $3, 'active') RETURNING id, institution, status`,
      [member.id, encrypt(itemId), institution],
    );
    await audit(
      { actorUserId: actor.userId, actorRole: actor.role, action: 'bank.linked', entityType: 'bank_link', entityId: rows[0].id, metadata: { institution }, ...actor.reqMeta },
      db,
    );
    return rows[0];
  });
}

/** Pull transactions for the member's active links and store them. Returns inserted count. */
export async function syncTransactions(member, actor) {
  const adapter = getPlaidAdapter();
  const { decrypt } = await import('../lib/crypto.js');

  const { rows: links } = await query(
    `SELECT id, plaid_item_id FROM bank_links
      WHERE member_id = $1 AND status = 'active' AND deleted_at IS NULL`,
    [member.id],
  );
  if (links.length === 0) throw new NotFoundError('No linked bank to sync');

  let inserted = 0;
  await withTransaction(async (db) => {
    for (const link of links) {
      const itemId = decrypt(link.plaid_item_id);
      const txns = await adapter.fetchTransactions(itemId, {});
      for (const t of txns) {
        // Idempotent-ish: skip if an identical row already exists this sync window.
        const { rowCount } = await db(
          `INSERT INTO transactions (member_id, date, amount, category, merchant)
           SELECT $1, $2, $3, $4, $5
           WHERE NOT EXISTS (
             SELECT 1 FROM transactions
              WHERE member_id = $1 AND date = $2 AND amount = $3 AND merchant = $5 AND deleted_at IS NULL
           )`,
          [member.id, t.date, t.amount, t.category, t.merchant],
        );
        inserted += rowCount;
      }
    }
    await audit(
      { actorUserId: actor.userId, actorRole: actor.role, action: 'transactions.synced', entityType: 'member', entityId: member.id, metadata: { inserted }, ...actor.reqMeta },
      db,
    );
  });
  return { inserted };
}

// Spend by category for the current calendar month (income excluded).
async function currentMonthSpendByCategory(memberId) {
  const { rows } = await query(
    `SELECT category, SUM(amount)::numeric(14,2) AS actual
       FROM transactions
      WHERE member_id = $1 AND deleted_at IS NULL
        AND category <> 'income'
        AND date_trunc('month', date) = date_trunc('month', CURRENT_DATE)
      GROUP BY category`,
    [memberId],
  );
  return new Map(rows.map((r) => [r.category, Number(r.actual)]));
}

export async function getBudgets(memberId) {
  const { rows } = await query(
    `SELECT id, category, monthly_target, kind FROM budget_targets
      WHERE member_id = $1 AND deleted_at IS NULL ORDER BY monthly_target DESC`,
    [memberId],
  );
  const spend = await currentMonthSpendByCategory(memberId);
  return rows.map((b) => ({
    ...b,
    monthly_target: Number(b.monthly_target),
    actual: spend.get(b.category) ?? 0,
  }));
}

export async function upsertBudget(member, { category, monthlyTarget }, actor) {
  const { rows } = await query(
    `INSERT INTO budget_targets (member_id, category, monthly_target)
     VALUES ($1, $2, $3)
     ON CONFLICT (member_id, category) WHERE deleted_at IS NULL
     DO UPDATE SET monthly_target = EXCLUDED.monthly_target
     RETURNING id, category, monthly_target`,
    [member.id, category, monthlyTarget],
  );
  await audit({ actorUserId: actor.userId, actorRole: actor.role, action: 'budget.set', entityType: 'budget_target', entityId: rows[0].id, metadata: { category, monthlyTarget }, ...actor.reqMeta });
  return rows[0];
}

export async function getSavingsGoals(memberId) {
  const { rows } = await query(
    `SELECT id, label, target_amount, current_amount FROM savings_goals
      WHERE member_id = $1 AND deleted_at IS NULL ORDER BY created_at`,
    [memberId],
  );
  return rows;
}

export async function upsertSavingsGoal(member, { id, label, targetAmount, currentAmount }, actor) {
  if (id) {
    const { rows } = await query(
      `UPDATE savings_goals SET label = COALESCE($3,label), target_amount = COALESCE($4,target_amount),
              current_amount = COALESCE($5,current_amount)
        WHERE id = $1 AND member_id = $2 AND deleted_at IS NULL
        RETURNING id, label, target_amount, current_amount`,
      [id, member.id, label ?? null, targetAmount ?? null, currentAmount ?? null],
    );
    if (!rows[0]) throw new NotFoundError('Savings goal not found');
    await audit({ actorUserId: actor.userId, actorRole: actor.role, action: 'savings.updated', entityType: 'savings_goal', entityId: id, ...actor.reqMeta });
    return rows[0];
  }
  const { rows } = await query(
    `INSERT INTO savings_goals (member_id, label, target_amount, current_amount)
     VALUES ($1, $2, $3, $4) RETURNING id, label, target_amount, current_amount`,
    [member.id, label, targetAmount ?? 0, currentAmount ?? 0],
  );
  await audit({ actorUserId: actor.userId, actorRole: actor.role, action: 'savings.created', entityType: 'savings_goal', entityId: rows[0].id, ...actor.reqMeta });
  return rows[0];
}

/** Money overview (spec §4.11): spend/save view, budgets vs actual, savings, coaching. */
export async function getMoneyOverview(member) {
  const { rows: links } = await query(
    `SELECT id, institution, status FROM bank_links
      WHERE member_id = $1 AND deleted_at IS NULL`,
    [member.id],
  );
  const budgets = await getBudgets(member.id);
  const savings = await getSavingsGoals(member.id);

  const { rows: monthly } = await query(
    `SELECT
        COALESCE(SUM(amount) FILTER (WHERE category = 'income'), 0)::numeric(14,2) AS income,
        COALESCE(SUM(amount) FILTER (WHERE category <> 'income'), 0)::numeric(14,2) AS spend
       FROM transactions
      WHERE member_id = $1 AND deleted_at IS NULL
        AND date_trunc('month', date) = date_trunc('month', CURRENT_DATE)`,
    [member.id],
  );

  const spendBudgets = budgets.filter((b) => b.kind !== 'save').map((b) => ({ ...b, label: categoryLabel(b.category) }));
  const toHome = budgets.find((b) => b.kind === 'save');
  const coaching = buildCoaching(spendBudgets, savings);
  const { rows: setup } = await query(`SELECT budget_setup_at FROM members WHERE id = $1`, [member.id]);
  const recent = await recentTransactions(member.id, 12);

  return {
    budgetSetup: Boolean(setup[0]?.budget_setup_at),
    toHome: toHome ? Number(toHome.monthly_target) : null,
    recent,
    linked: links.length > 0,
    institutions: links.map((l) => l.institution),
    month: {
      income: Number(monthly[0].income),
      spend: Number(monthly[0].spend),
      net: Number(monthly[0].income) - Number(monthly[0].spend),
    },
    budgets: spendBudgets,
    savings: savings.map((s) => ({ ...s, target_amount: Number(s.target_amount), current_amount: Number(s.current_amount) })),
    coaching,
  };
}

// ---------------------------------------------------------------------------
// Budget setup (Deon 2026-09-13): bank first, then a proposed budget built from the
// member's own transactions, edited and approved by the member, with a "to your home"
// savings line wired to the down-payment goal.
// ---------------------------------------------------------------------------
const DISCRETIONARY = new Set(['dining', 'shopping', 'entertainment', 'subscriptions', 'personal']);
const FIXED = new Set(['housing', 'utilities', 'insurance', 'debt', 'loans', 'credit_cards', 'childcare', 'transport', 'phone']);
const LABELS = { housing: 'Rent or mortgage', utilities: 'Utilities', groceries: 'Groceries', dining: 'Eating out', transport: 'Transportation', shopping: 'Shopping', entertainment: 'Entertainment', subscriptions: 'Subscriptions', insurance: 'Insurance', phone: 'Phone and internet', childcare: 'Childcare', debt: 'Debt payments', credit_cards: 'Credit cards', loans: 'Loans', personal: 'Personal', health: 'Health', other: 'Everything else' };
export const categoryLabel = (c) => LABELS[c] ?? c.replace(/_/g, ' ').replace(/^./, (m) => m.toUpperCase());
const round5 = (n) => Math.max(0, Math.round(n / 5) * 5);

/** Average monthly spend by category over the last 90 days (or fewer, if less history). */
async function trailingMonthlyByCategory(memberId) {
  const { rows } = await query(
    `SELECT category, SUM(amount)::numeric(14,2) AS total,
            GREATEST(1, LEAST(3, COUNT(DISTINCT date_trunc('month', date)))) AS months
       FROM transactions
      WHERE member_id = $1 AND deleted_at IS NULL AND date >= CURRENT_DATE - INTERVAL '90 days'
      GROUP BY category`,
    [memberId],
  );
  return rows.map((r) => ({ category: r.category, monthly: Number(r.total) / Number(r.months) }));
}

/**
 * Propose a budget from the member's own bank data plus their stated income.
 * Fixed lines are kept at actual; discretionary lines are trimmed 15%; the balance
 * becomes the "to your home" savings line. Nothing here is a promise: it is a
 * starting point the member edits.
 */
export async function proposeBudget(member) {
  const [rows, intake, links] = await Promise.all([
    trailingMonthlyByCategory(member.id),
    query(`SELECT household_income FROM intake_profiles WHERE member_id = $1 AND deleted_at IS NULL`, [member.id]).then((r) => r.rows[0] ?? null),
    query(`SELECT institution FROM bank_links WHERE member_id = $1 AND status = 'active' AND deleted_at IS NULL`, [member.id]).then((r) => r.rows),
  ]);
  const bankIncome = rows.find((r) => r.category === 'income')?.monthly ?? 0;
  const statedIncome = intake?.household_income ? Number(intake.household_income) / 12 : 0;
  // Take-home from the bank is the truth when we have it; stated income is gross, so fall back to 78%.
  const monthlyIncome = bankIncome > 0 ? bankIncome : Math.round(statedIncome * 0.78);

  const lines = rows.filter((r) => r.category !== 'income' && r.monthly >= 5).map((r) => {
    const trim = DISCRETIONARY.has(r.category) ? 0.85 : 1;
    return { category: r.category, label: categoryLabel(r.category), actual: Math.round(r.monthly), monthlyTarget: round5(r.monthly * trim), fixed: FIXED.has(r.category), trimmed: trim < 1 };
  }).sort((a, b) => b.actual - a.actual);
  const spendTotal = lines.reduce((a, l) => a + l.monthlyTarget, 0);
  const toHome = Math.max(0, round5(monthlyIncome - spendTotal));

  return {
    linked: links.length > 0,
    institutions: links.map((l) => l.institution),
    monthlyIncome: Math.round(monthlyIncome),
    incomeSource: bankIncome > 0 ? 'bank' : statedIncome > 0 ? 'stated' : 'none',
    lines,
    toHome,
    note: lines.length === 0
      ? 'No transactions yet. Link your bank and sync, or enter your own numbers below.'
      : `Built from your last ${Math.min(3, Math.max(1, rows.length ? 3 : 1))} months of bank activity. Eating out, shopping, and entertainment are trimmed 15 percent; everything else is left at what you actually spend. Change any line.`,
  };
}

/** Save the whole budget in one go and record the setup. Replaces existing spend lines. */
export async function setupBudget(member, { lines, toHome, downPaymentTarget }, actor) {
  return withTransaction(async (db) => {
    await db(`UPDATE budget_targets SET deleted_at = now() WHERE member_id = $1 AND deleted_at IS NULL`, [member.id]);
    for (const l of lines) {
      await db(
        `INSERT INTO budget_targets (member_id, category, monthly_target, kind) VALUES ($1, $2, $3, 'spend')`,
        [member.id, l.category, l.monthlyTarget],
      );
    }
    await db(`INSERT INTO budget_targets (member_id, category, monthly_target, kind) VALUES ($1, 'to_home', $2, 'save')`, [member.id, toHome ?? 0]);
    // One down-payment goal; create or retarget it.
    const { rows: goals } = await db(`SELECT id FROM savings_goals WHERE member_id = $1 AND deleted_at IS NULL AND label = 'Down payment and closing' LIMIT 1`, [member.id]);
    if (goals[0]) {
      if (downPaymentTarget != null) await db(`UPDATE savings_goals SET target_amount = $2 WHERE id = $1`, [goals[0].id, downPaymentTarget]);
    } else {
      await db(`INSERT INTO savings_goals (member_id, label, target_amount, current_amount) VALUES ($1, 'Down payment and closing', $2, 0)`, [member.id, downPaymentTarget ?? 0]);
    }
    await db(`UPDATE members SET budget_setup_at = now() WHERE id = $1`, [member.id]);
    await audit({ actorUserId: actor.userId, actorRole: actor.role, action: 'budget.setup', entityType: 'member', entityId: member.id, metadata: { lines: lines.length, toHome }, ...actor.reqMeta }, db);
    return { ok: true, lines: lines.length, toHome };
  });
}

/** Recent transactions for the member (newest first). */
export async function recentTransactions(memberId, limit = 30) {
  const { rows } = await query(
    `SELECT id, date, amount, category, merchant FROM transactions
      WHERE member_id = $1 AND deleted_at IS NULL ORDER BY date DESC, created_at DESC LIMIT $2`,
    [memberId, limit],
  );
  return rows.map((r) => ({ ...r, amount: Number(r.amount), label: categoryLabel(r.category) }));
}
