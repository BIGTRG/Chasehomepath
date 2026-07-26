import { query, withTransaction } from '../db/pool.js';
import { NotFoundError, ValidationError } from '../lib/errors.js';
import { assertPlacementReady, MIN_PLAN_DAY_FOR_PLACEMENT, canBePlacementReady } from '../compliance/rules.js';
import { audit } from '../lib/audit.js';
import { TRACK_TYPES } from './member.service.js';

/**
 * Assemble the plan home view for a member (spec §4.7): target date, plan day,
 * six-track progress, milestones. Leads with the day count — NOT a score, and no
 * score is included here (score-withheld rule lives in the credit phase).
 */
export async function getPlanForMember(memberId) {
  const { rows: planRows } = await query(
    `SELECT p.id, p.target_date, p.status,
            GREATEST(0, (CURRENT_DATE - m.join_date))::int AS plan_day,
            m.join_date
       FROM plans p
       JOIN members m ON m.id = p.member_id
      WHERE p.member_id = $1 AND p.deleted_at IS NULL
      ORDER BY p.created_at ASC
      LIMIT 1`,
    [memberId],
  );
  const plan = planRows[0];
  if (!plan) throw new NotFoundError('No plan for this member');

  const { rows: tracks } = await query(
    `SELECT track_type, status, progress_pct
       FROM plan_tracks
      WHERE plan_id = $1 AND deleted_at IS NULL`,
    [plan.id],
  );

  const { rows: milestones } = await query(
    `SELECT id, track_type, label, due_day, completed_at
       FROM milestones
      WHERE plan_id = $1 AND deleted_at IS NULL
      ORDER BY due_day NULLS LAST, created_at ASC`,
    [plan.id],
  );

  // Order tracks canonically and fill any missing (defensive) with not_started.
  const byType = new Map(tracks.map((t) => [t.track_type, t]));
  const orderedTracks = TRACK_TYPES.map((type) => ({
    track_type: type,
    status: byType.get(type)?.status ?? 'not_started',
    progress_pct: byType.get(type)?.progress_pct ?? 0,
  }));

  const planDay = plan.plan_day;
  const overallPct = Math.round(
    orderedTracks.reduce((sum, t) => sum + t.progress_pct, 0) / orderedTracks.length,
  );

  return {
    planId: plan.id,
    status: plan.status,
    joinDate: plan.join_date,
    targetDate: plan.target_date,
    planDay,
    overallProgressPct: overallPct,
    tracks: orderedTracks,
    milestones,
    // 90-day rule, surfaced for the UI to show visibly (spec §4.7, §8).
    placement: {
      minDay: MIN_PLAN_DAY_FOR_PLACEMENT,
      eligible: canBePlacementReady(planDay),
      daysRemaining: Math.max(0, MIN_PLAN_DAY_FOR_PLACEMENT - planDay),
    },
  };
}

/** Member-facing: mark a milestone complete / incomplete. */
export async function setMilestoneCompletion(memberId, milestoneId, completed, actor) {
  return withTransaction(async (db) => {
    const { rows } = await db(
      `SELECT ms.id
         FROM milestones ms
         JOIN plans p ON p.id = ms.plan_id
        WHERE ms.id = $1 AND p.member_id = $2 AND ms.deleted_at IS NULL`,
      [milestoneId, memberId],
    );
    if (!rows[0]) throw new NotFoundError('Milestone not found');

    const { rows: updated } = await db(
      `UPDATE milestones SET completed_at = $2 WHERE id = $1
       RETURNING id, track_type, label, due_day, completed_at`,
      [milestoneId, completed ? new Date() : null],
    );
    await audit(
      {
        actorUserId: actor.userId,
        actorRole: actor.role,
        action: completed ? 'milestone.completed' : 'milestone.reopened',
        entityType: 'milestone',
        entityId: milestoneId,
        ...actor.reqMeta,
      },
      db,
    );
    return updated[0];
  });
}

/**
 * Update a track's progress. progress_pct in [0,100]; status derived from it unless
 * explicitly provided. Operator/staff or system logic drives this in later phases.
 */
export async function updateTrackProgress(memberId, trackType, { progressPct, status }, actor) {
  if (!TRACK_TYPES.includes(trackType)) throw new ValidationError('Unknown track type');
  if (progressPct != null && (progressPct < 0 || progressPct > 100)) {
    throw new ValidationError('progressPct must be between 0 and 100');
  }

  const derivedStatus =
    status ?? (progressPct >= 100 ? 'complete' : progressPct > 0 ? 'in_progress' : 'not_started');

  return withTransaction(async (db) => {
    const { rows } = await db(
      `UPDATE plan_tracks pt
          SET progress_pct = COALESCE($3, pt.progress_pct),
              status = $4
         FROM plans p
        WHERE pt.plan_id = p.id AND p.member_id = $1 AND pt.track_type = $2
          AND pt.deleted_at IS NULL
       RETURNING pt.track_type, pt.status, pt.progress_pct`,
      [memberId, trackType, progressPct ?? null, derivedStatus],
    );
    if (!rows[0]) throw new NotFoundError('Track not found');
    await audit(
      {
        actorUserId: actor.userId,
        actorRole: actor.role,
        action: 'plan_track.updated',
        entityType: 'plan_track',
        entityId: null,
        metadata: { trackType, progressPct, status: derivedStatus },
        ...actor.reqMeta,
      },
      db,
    );
    return rows[0];
  });
}

/**
 * Mark the plan placement-ready. Enforces the 90-day minimum (spec §8): throws
 * ComplianceError if plan_day < 90. This is the code-level gate, not UI-only.
 */
export async function markPlacementReady(memberId, actor) {
  return withTransaction(async (db) => {
    const { rows } = await db(
      `SELECT p.id, GREATEST(0, (CURRENT_DATE - m.join_date))::int AS plan_day
         FROM plans p JOIN members m ON m.id = p.member_id
        WHERE p.member_id = $1 AND p.deleted_at IS NULL
        ORDER BY p.created_at ASC LIMIT 1`,
      [memberId],
    );
    const plan = rows[0];
    if (!plan) throw new NotFoundError('No plan for this member');

    assertPlacementReady(plan.plan_day); // ← 90-day rule, enforced in code

    const { rows: updated } = await db(
      `UPDATE plans SET status = 'placement_ready' WHERE id = $1 RETURNING id, status`,
      [plan.id],
    );
    await audit(
      {
        actorUserId: actor.userId,
        actorRole: actor.role,
        action: 'plan.placement_ready',
        entityType: 'plan',
        entityId: plan.id,
        metadata: { planDay: plan.plan_day },
        ...actor.reqMeta,
      },
      db,
    );
    return updated[0];
  });
}
