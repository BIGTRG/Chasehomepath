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
    `SELECT id, category, monthly_target FROM budget_targets
      WHERE member_id = $1 AND deleted_at IS NULL ORDER BY category`,
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

  const coaching = buildCoaching(budgets, savings);

  return {
    linked: links.length > 0,
    institutions: links.map((l) => l.institution),
    month: {
      income: Number(monthly[0].income),
      spend: Number(monthly[0].spend),
      net: Number(monthly[0].income) - Number(monthly[0].spend),
    },
    budgets,
    savings: savings.map((s) => ({ ...s, target_amount: Number(s.target_amount), current_amount: Number(s.current_amount) })),
    coaching,
  };
}
