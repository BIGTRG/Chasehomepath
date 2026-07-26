import { query, withTransaction } from '../db/pool.js';
import { audit } from '../lib/audit.js';
import { NotFoundError, ConflictError } from '../lib/errors.js';
import { ILLUSTRATIVE_APR } from '../marketplace/estimate.js';

// Illustrative appreciation for the value ESTIMATE only (not a valuation product — spec §12).
const ANNUAL_APPRECIATION = 0.03;
// Suggest talking to the team about refinancing when the rate gap is at least this.
const REFI_GAP = 0.0075;

const DEFAULT_MAINTENANCE = [
  { label: 'Replace HVAC filter', category: 'hvac', cadenceMonths: 3 },
  { label: 'Clean gutters', category: 'exterior', cadenceMonths: 6 },
  { label: 'Test smoke & CO detectors', category: 'safety', cadenceMonths: 6 },
  { label: 'Flush water heater', category: 'plumbing', cadenceMonths: 12 },
];

/**
 * Enter homeowner mode (spec §4.16): record the purchased home, flip the plan to completed
 * (which also unlocks the "after you own it" education block), and seed maintenance tasks.
 */
export async function recordHomeownership(member, data, actor) {
  return withTransaction(async (db) => {
    const { rows: existing } = await db(
      `SELECT id FROM homeownerships WHERE member_id = $1 AND deleted_at IS NULL`,
      [member.id],
    );
    if (existing[0]) throw new ConflictError('Homeownership already recorded');

    const { rows } = await db(
      `INSERT INTO homeownerships
         (member_id, listing_id, address, purchase_price, purchase_date, mortgage_balance,
          interest_rate, monthly_escrow, monthly_taxes, monthly_insurance)
       VALUES ($1,$2,$3,$4,COALESCE($5,CURRENT_DATE),$6,$7,$8,$9,$10)
       RETURNING id`,
      [member.id, data.listingId ?? null, data.address ?? null, data.purchasePrice,
       data.purchaseDate ?? null, data.mortgageBalance ?? null, data.interestRate ?? null,
       data.monthlyEscrow ?? null, data.monthlyTaxes ?? null, data.monthlyInsurance ?? null],
    );

    // Plan completed → unlocks the "after you own it" curriculum (Phase 6 gate).
    await db(`UPDATE plans SET status = 'completed' WHERE member_id = $1 AND deleted_at IS NULL`, [member.id]);

    for (const task of DEFAULT_MAINTENANCE) {
      await db(
        `INSERT INTO maintenance_tasks (member_id, label, category, cadence_months, due_date)
         VALUES ($1,$2,$3,$4, (CURRENT_DATE + make_interval(months => $5))::date)`,
        [member.id, task.label, task.category, task.cadenceMonths, task.cadenceMonths],
      );
    }

    await audit({ actorUserId: actor.userId, actorRole: actor.role, action: 'homeowner.recorded', entityType: 'homeownership', entityId: rows[0].id, ...actor.reqMeta }, db);
    return { homeownershipId: rows[0].id };
  });
}

/**
 * Homeowner dashboard: maintenance, escrow/taxes, value estimate, and a refi alert.
 * The value figure is a simple ESTIMATE; refi alerts are informational and defer rate/term
 * questions to the licensed team (no quotes, no promises — §7.2/§8).
 */
export async function getDashboard(member) {
  const { rows } = await query(
    `SELECT id, address, purchase_price, purchase_date, mortgage_balance, interest_rate,
            monthly_escrow, monthly_taxes, monthly_insurance,
            GREATEST(0, (CURRENT_DATE - purchase_date))::int AS days_owned
       FROM homeownerships WHERE member_id = $1 AND deleted_at IS NULL`,
    [member.id],
  );
  if (!rows[0]) return { isHomeowner: false };
  const h = rows[0];

  const yearsOwned = h.days_owned / 365.25;
  const purchasePrice = Number(h.purchase_price);
  const estimatedValue = Math.round(purchasePrice * (1 + ANNUAL_APPRECIATION * yearsOwned));
  const equityEstimate = h.mortgage_balance != null ? estimatedValue - Number(h.mortgage_balance) : null;

  const { rows: tasks } = await query(
    `SELECT id, label, category, due_date, status FROM maintenance_tasks
      WHERE member_id = $1 AND deleted_at IS NULL ORDER BY (status = 'done'), due_date ASC`,
    [member.id],
  );

  // Refi alert: informational only. Compares their rate to an illustrative market rate.
  let refiAlert = null;
  if (h.interest_rate != null && Number(h.interest_rate) - ILLUSTRATIVE_APR >= REFI_GAP) {
    refiAlert = {
      message:
        'Market rates today are illustratively lower than your current rate. It may be worth ' +
        'asking your specialist whether refinancing makes sense for you — we can’t quote rates here.',
    };
  }

  return {
    isHomeowner: true,
    home: {
      address: h.address,
      purchasePrice,
      purchaseDate: h.purchase_date,
      mortgageBalance: h.mortgage_balance != null ? Number(h.mortgage_balance) : null,
      interestRate: h.interest_rate != null ? Number(h.interest_rate) : null,
    },
    housing: {
      monthlyEscrow: h.monthly_escrow != null ? Number(h.monthly_escrow) : null,
      monthlyTaxes: h.monthly_taxes != null ? Number(h.monthly_taxes) : null,
      monthlyInsurance: h.monthly_insurance != null ? Number(h.monthly_insurance) : null,
    },
    value: { estimated: estimatedValue, equityEstimate, note: 'Estimate only — not an appraisal.' },
    maintenance: tasks,
    refiAlert,
  };
}

export async function completeMaintenance(member, taskId, actor) {
  // Mark done and, for recurring tasks, schedule the next due date. It stays 'done' until
  // that date; a scheduler (future) reopens it when due.
  const { rows } = await query(
    `UPDATE maintenance_tasks SET status = 'done', completed_at = now(),
            due_date = CASE WHEN cadence_months > 0
                            THEN (CURRENT_DATE + make_interval(months => cadence_months::int))::date
                            ELSE due_date END
      WHERE id = $1 AND member_id = $2 AND deleted_at IS NULL
      RETURNING id, label, status, due_date`,
    [taskId, member.id],
  );
  if (!rows[0]) throw new NotFoundError('Maintenance task not found');
  await audit({ actorUserId: actor.userId, actorRole: actor.role, action: 'maintenance.completed', entityType: 'maintenance_task', entityId: taskId, ...actor.reqMeta });
  return rows[0];
}
