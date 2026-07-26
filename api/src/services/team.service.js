import { query, withTransaction } from '../db/pool.js';
import { audit } from '../lib/audit.js';
import { NotFoundError, ForbiddenError } from '../lib/errors.js';
import { assertCanTouchClients } from '../compliance/rules.js';

/**
 * Team & communication (spec §3, §8). Compliance:
 *  - Onboarding gate: no staff/partner is assigned to a client until their onboarding
 *    case is complete and all licenses are verified.
 *  - In-app only: team listings never expose personal phone/email between members and team.
 */

/** Gather a user's onboarding state for the gate check. */
async function onboardingState(userId) {
  const { rows: cases } = await query(
    `SELECT stage FROM onboarding_cases WHERE user_id = $1 AND deleted_at IS NULL
      ORDER BY started_at DESC LIMIT 1`,
    [userId],
  );
  const { rows: licenses } = await query(
    `SELECT status, verified_at FROM license_records WHERE user_id = $1 AND deleted_at IS NULL`,
    [userId],
  );
  return { stage: cases[0]?.stage ?? 'application', licenses };
}

/**
 * Assign a staff/partner user to a member's team. Enforces the onboarding gate (§8)
 * in code — throws ComplianceError if the assignee isn't fully onboarded/verified.
 */
export async function assignTeamMember(memberId, { assigneeUserId, assigneeKind, roleOnTeam }, actor) {
  const state = await onboardingState(assigneeUserId);
  assertCanTouchClients(state); // ← onboarding gate

  return withTransaction(async (db) => {
    const { rows } = await db(
      `INSERT INTO team_assignments (member_id, staff_or_partner_user, assignee_kind, role_on_team)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (member_id, staff_or_partner_user, role_on_team) WHERE deleted_at IS NULL
       DO UPDATE SET assignee_kind = EXCLUDED.assignee_kind
       RETURNING id, member_id, staff_or_partner_user, assignee_kind, role_on_team, assigned_at`,
      [memberId, assigneeUserId, assigneeKind, roleOnTeam],
    );
    await audit(
      { actorUserId: actor.userId, actorRole: actor.role, action: 'team.assigned', entityType: 'team_assignment', entityId: rows[0].id, metadata: { memberId, assigneeUserId, roleOnTeam }, ...actor.reqMeta },
      db,
    );
    return rows[0];
  });
}

export async function removeAssignment(assignmentId, actor) {
  const { rows } = await query(
    `UPDATE team_assignments SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL RETURNING id`,
    [assignmentId],
  );
  if (!rows[0]) throw new NotFoundError('Assignment not found');
  await audit({ actorUserId: actor.userId, actorRole: actor.role, action: 'team.unassigned', entityType: 'team_assignment', entityId: assignmentId, ...actor.reqMeta });
}

/**
 * The member's team for display. Returns display fields ONLY — name-ish label, title,
 * role. Never phone/email: comms happen in-app (spec §8 "In-app communication only").
 */
export async function listTeamForMember(memberId) {
  const { rows } = await query(
    `SELECT ta.id, ta.role_on_team, ta.assignee_kind, ta.staff_or_partner_user AS user_id,
            COALESCE(s.title, p.partner_type) AS title,
            p.company_name,
            COALESCE(
              (SELECT ROUND(AVG(responsiveness_score)::numeric, 1)
                 FROM ratings r WHERE r.rated_user_id = ta.staff_or_partner_user AND r.deleted_at IS NULL),
              NULL
            ) AS avg_responsiveness
       FROM team_assignments ta
       LEFT JOIN staff s ON s.user_id = ta.staff_or_partner_user AND s.deleted_at IS NULL
       LEFT JOIN partners p ON p.user_id = ta.staff_or_partner_user AND p.deleted_at IS NULL
      WHERE ta.member_id = $1 AND ta.deleted_at IS NULL
      ORDER BY ta.assigned_at ASC`,
    [memberId],
  );
  return rows.map((r) => ({
    assignmentId: r.id,
    userId: r.user_id,
    role: r.role_on_team,
    kind: r.assignee_kind,
    title: r.title,
    company: r.company_name ?? null,
    avgResponsiveness: r.avg_responsiveness != null ? Number(r.avg_responsiveness) : null,
  }));
}

/** Is this user allowed to see/participate in this member's comms? */
export async function canAccessMember(user, memberId) {
  if (user.role === 'admin' || user.role === 'manager') return true;
  // The member themselves:
  const { rows: mine } = await query(
    `SELECT 1 FROM members WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
    [memberId, user.id],
  );
  if (mine[0]) return true;
  // On the member's team:
  const { rows: onTeam } = await query(
    `SELECT 1 FROM team_assignments WHERE member_id = $1 AND staff_or_partner_user = $2 AND deleted_at IS NULL`,
    [memberId, user.id],
  );
  return Boolean(onTeam[0]);
}

export async function assertCanAccessMember(user, memberId) {
  if (!(await canAccessMember(user, memberId))) {
    throw new ForbiddenError('You are not on this member’s team');
  }
}
