import { query } from '../db/pool.js';
import { NotFoundError } from '../lib/errors.js';
import { MIN_PLAN_DAY_FOR_PLACEMENT } from '../compliance/rules.js';

export const TRACK_TYPES = Object.freeze([
  'credit',
  'budget',
  'savings',
  'education',
  'readiness',
  'timeline',
]);

/**
 * Create a member's full profile in one transaction: members row, their plan,
 * the six plan_tracks, and the 90-day earliest-placement anchor milestone.
 * "The product is the plan" (spec §1) — so a member always has one.
 *
 * @param db transaction-bound query fn (required — call inside withTransaction)
 */
export async function createMemberProfile(userId, { targetDate = null } = {}, db) {
  if (!db) throw new Error('createMemberProfile must run inside a transaction');

  const { rows: memberRows } = await db(
    `INSERT INTO members (user_id, target_date, plan_day, join_date)
     VALUES ($1, $2, 0, CURRENT_DATE)
     RETURNING id`,
    [userId, targetDate],
  );
  const memberId = memberRows[0].id;

  const { rows: planRows } = await db(
    `INSERT INTO plans (member_id, target_date, status) VALUES ($1, $2, 'active') RETURNING id`,
    [memberId, targetDate],
  );
  const planId = planRows[0].id;

  await db(`UPDATE members SET plan_id = $1 WHERE id = $2`, [planId, memberId]);

  // Six tracks, one row each.
  for (const trackType of TRACK_TYPES) {
    await db(
      `INSERT INTO plan_tracks (plan_id, track_type, status, progress_pct)
       VALUES ($1, $2, 'not_started', 0)`,
      [planId, trackType],
    );
  }

  // The 90-day earliest-placement anchor (spec §8 "90-day minimum"). Additional
  // milestones are authored later (operator console) — content isn't fixed here.
  await db(
    `INSERT INTO milestones (plan_id, track_type, label, due_day)
     VALUES ($1, 'timeline', $2, $3)`,
    [planId, 'Earliest placement eligibility', MIN_PLAN_DAY_FOR_PLACEMENT],
  );

  return { memberId, planId };
}

/** Look up the member row for a user id. */
export async function findMemberByUserId(userId) {
  const { rows } = await query(
    `SELECT id, user_id, plan_id, membership_tier, target_date, join_date,
            GREATEST(0, (CURRENT_DATE - join_date))::int AS plan_day
       FROM members WHERE user_id = $1 AND deleted_at IS NULL`,
    [userId],
  );
  return rows[0] ?? null;
}

export async function requireMemberByUserId(userId) {
  const member = await findMemberByUserId(userId);
  if (!member) throw new NotFoundError('No member profile for this account');
  return member;
}
