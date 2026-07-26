import { query, withTransaction } from '../db/pool.js';
import { audit } from '../lib/audit.js';
import { NotFoundError } from '../lib/errors.js';
import { isUnlocked, defaultConditionForPhase } from '../education/unlock.js';

/** Current plan context used to evaluate unlock conditions. */
async function planContext(memberId) {
  const { rows } = await query(
    `SELECT p.id AS plan_id, p.status AS plan_status,
            GREATEST(0, (CURRENT_DATE - m.join_date))::int AS plan_day
       FROM plans p JOIN members m ON m.id = p.member_id
      WHERE p.member_id = $1 AND p.deleted_at IS NULL
      ORDER BY p.created_at ASC LIMIT 1`,
    [memberId],
  );
  if (!rows[0]) throw new NotFoundError('No plan for this member');

  const { rows: tracks } = await query(
    `SELECT pt.track_type, pt.progress_pct FROM plan_tracks pt
      WHERE pt.plan_id = $1 AND pt.deleted_at IS NULL`,
    [rows[0].plan_id],
  );
  const trackProgress = Object.fromEntries(tracks.map((t) => [t.track_type, t.progress_pct]));
  return { planDay: rows[0].plan_day, planStatus: rows[0].plan_status, trackProgress };
}

/** Create a module_assignment per module if the member has none yet (assignment-from-plan). */
async function ensureAssignments(memberId) {
  const { rows: existing } = await query(
    `SELECT 1 FROM module_assignments WHERE member_id = $1 AND deleted_at IS NULL LIMIT 1`,
    [memberId],
  );
  if (existing[0]) return;

  await withTransaction(async (db) => {
    const { rows: modules } = await db(`SELECT id, phase FROM modules WHERE deleted_at IS NULL`);
    for (const mod of modules) {
      await db(
        `INSERT INTO module_assignments (member_id, module_id, status, unlock_condition)
         VALUES ($1, $2, 'locked', $3)`,
        [memberId, mod.id, JSON.stringify(defaultConditionForPhase(mod.phase))],
      );
    }
  });
}

/**
 * Recompute lock/unlock for all of a member's non-done assignments against current plan
 * state. Done stays done. Returns nothing; callers re-read.
 */
async function evaluateUnlocks(memberId) {
  const ctx = await planContext(memberId);
  const { rows } = await query(
    `SELECT id, unlock_condition, status FROM module_assignments
      WHERE member_id = $1 AND deleted_at IS NULL AND status <> 'done'`,
    [memberId],
  );
  for (const a of rows) {
    const desired = isUnlocked(a.unlock_condition, ctx) ? 'available' : 'locked';
    if (desired !== a.status) {
      await query(`UPDATE module_assignments SET status = $2 WHERE id = $1`, [a.id, desired]);
    }
  }
}

/** Learn screen (spec §4.13): assigned curriculum grouped before/during/after with status. */
export async function getLearnForMember(memberId) {
  await ensureAssignments(memberId);
  await evaluateUnlocks(memberId);

  const { rows } = await query(
    `SELECT ma.id AS assignment_id, ma.status, ma.completed_at,
            m.id AS module_id, m.title, m.phase, m.duration_min
       FROM module_assignments ma
       JOIN modules m ON m.id = ma.module_id
      WHERE ma.member_id = $1 AND ma.deleted_at IS NULL AND m.deleted_at IS NULL
      ORDER BY CASE m.phase WHEN 'before' THEN 0 WHEN 'during' THEN 1 ELSE 2 END, m.duration_min`,
    [memberId],
  );

  const groups = { before: [], during: [], after: [] };
  for (const r of rows) {
    groups[r.phase].push({
      assignmentId: r.assignment_id,
      moduleId: r.module_id,
      title: r.title,
      durationMin: r.duration_min,
      status: r.status,
      completedAt: r.completed_at,
    });
  }
  const total = rows.length;
  const done = rows.filter((r) => r.status === 'done').length;
  return { groups, progress: { done, total, pct: total ? Math.round((done / total) * 100) : 0 } };
}

/** Member marks a module done — only if it's currently available (or already done). */
export async function markModuleDone(memberId, moduleId, actor) {
  return withTransaction(async (db) => {
    const { rows } = await db(
      `SELECT id, status FROM module_assignments
        WHERE member_id = $1 AND module_id = $2 AND deleted_at IS NULL`,
      [memberId, moduleId],
    );
    const a = rows[0];
    if (!a) throw new NotFoundError('Module not assigned');
    if (a.status === 'locked') throw new NotFoundError('Module is not available yet');

    const { rows: updated } = await db(
      `UPDATE module_assignments SET status = 'done', completed_at = now()
        WHERE id = $1 RETURNING id, status, completed_at`,
      [a.id],
    );
    await audit(
      { actorUserId: actor.userId, actorRole: actor.role, action: 'module.completed', entityType: 'module_assignment', entityId: a.id, metadata: { moduleId }, ...actor.reqMeta },
      db,
    );
    return updated[0];
  });
}
