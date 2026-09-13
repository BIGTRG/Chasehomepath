import { query, withTransaction } from '../db/pool.js';
import { audit } from '../lib/audit.js';
import { NotFoundError, ForbiddenError, ValidationError } from '../lib/errors.js';
import { getPlanForMember } from './plan.service.js';
import { listTeamForMember, canAccessMember } from './team.service.js';

const SPECIALIST_CAPACITY_TARGET = { min: 10, max: 12 }; // spec §5.3

/**
 * Client roster (spec §5.1). Managers/admins see everyone; specialists see only members
 * they're assigned to. Filterable by plan status and track health.
 */
export async function roster(user, { status, health } = {}) {
  const params = [];
  const clauses = [`m.deleted_at IS NULL`];

  // Specialists are limited to their assigned members.
  if (user.role === 'specialist') {
    params.push(user.id);
    clauses.push(`EXISTS (SELECT 1 FROM team_assignments ta
                          WHERE ta.member_id = m.id AND ta.staff_or_partner_user = $${params.length}
                            AND ta.deleted_at IS NULL)`);
  }
  if (status) {
    params.push(status);
    clauses.push(`p.status = $${params.length}`);
  }

  const { rows } = await query(
    `SELECT m.id AS member_id, u.email, p.status AS plan_status,
            GREATEST(0, (CURRENT_DATE - m.join_date))::int AS plan_day,
            COALESCE(ROUND(AVG(pt.progress_pct)::numeric, 0), 0)::int AS avg_progress,
            COALESCE(MIN(pt.progress_pct), 0)::int AS min_progress,
            (SELECT COUNT(*)::int FROM team_assignments ta WHERE ta.member_id = m.id AND ta.deleted_at IS NULL) AS team_size
       FROM members m
       JOIN users u ON u.id = m.user_id
       LEFT JOIN plans p ON p.member_id = m.id AND p.deleted_at IS NULL
       LEFT JOIN plan_tracks pt ON pt.plan_id = p.id AND pt.deleted_at IS NULL
      WHERE ${clauses.join(' AND ')}
      GROUP BY m.id, u.email, p.status, m.join_date
      ORDER BY plan_day DESC`,
    params,
  );

  // Track health derived from min track progress; optional filter.
  const withHealth = rows.map((r) => ({
    memberId: r.member_id,
    email: r.email,
    planStatus: r.plan_status,
    planDay: r.plan_day,
    avgProgress: r.avg_progress,
    health: r.min_progress >= 50 ? 'green' : r.min_progress >= 20 ? 'amber' : 'red',
    teamSize: r.team_size,
  }));
  return health ? withHealth.filter((m) => m.health === health) : withHealth;
}

/** Full client detail (spec §5.2): plan, six tracks, team, recent messages, disputes, appts. */
export async function clientDetail(user, memberId) {
  if (!(await canAccessMember(user, memberId))) throw new ForbiddenError('Not your client');

  const { rows: memberRows } = await query(
    `SELECT m.id, u.email, u.phone, m.membership_tier, m.join_date,
            GREATEST(0, (CURRENT_DATE - m.join_date))::int AS plan_day
       FROM members m JOIN users u ON u.id = m.user_id
      WHERE m.id = $1 AND m.deleted_at IS NULL`,
    [memberId],
  );
  if (!memberRows[0]) throw new NotFoundError('Member not found');

  const plan = await getPlanForMember(memberId);
  const team = await listTeamForMember(memberId);

  const { rows: messages } = await query(
    `SELECT msg.id, msg.sender_id, msg.body, msg.sent_at
       FROM messages msg JOIN message_threads t ON t.id = msg.thread_id
      WHERE t.member_id = $1 AND msg.deleted_at IS NULL
      ORDER BY msg.sent_at DESC LIMIT 20`,
    [memberId],
  );
  const { rows: disputes } = await query(
    `SELECT d.id, d.status, d.day_count, ci.creditor FROM disputes d
       JOIN credit_items ci ON ci.id = d.credit_item_id
      WHERE d.member_id = $1 AND d.deleted_at IS NULL ORDER BY d.filed_at DESC`,
    [memberId],
  );
  const { rows: appointments } = await query(
    `SELECT id, type, scheduled_at, status, is_consultation FROM appointments
      WHERE member_id = $1 AND deleted_at IS NULL ORDER BY scheduled_at DESC`,
    [memberId],
  );

  return {
    member: memberRows[0],
    plan,
    team,
    messages: messages.reverse(),
    disputes,
    appointments,
  };
}

/** Team management capacity view (spec §5.3): clients per specialist vs the 10–12 target. */
export async function capacity() {
  const { rows } = await query(
    `SELECT s.user_id, u.email, u.role, u.status, s.title, s.capacity_target,
            (SELECT COUNT(*)::int FROM team_assignments ta
              WHERE ta.staff_or_partner_user = s.user_id AND ta.deleted_at IS NULL) AS client_count
       FROM staff s JOIN users u ON u.id = s.user_id
      WHERE s.deleted_at IS NULL AND u.deleted_at IS NULL
      ORDER BY client_count DESC`,
  );
  return rows.map((r) => {
    const max = r.capacity_target ?? SPECIALIST_CAPACITY_TARGET.max;
    const min = Math.max(1, max - 2);
    return {
      userId: r.user_id,
      email: r.email,
      role: r.role,
      status: r.status,
      title: r.title,
      capacityTarget: max,
      clientCount: r.client_count,
      target: { min, max },
      flag: r.client_count > max ? 'over' : r.client_count < min ? 'under' : 'ok',
    };
  });
}

/** Ratings dashboard (spec §5.6): avg responsiveness per staff; flag low performers. */
export async function ratingsDashboard() {
  const { rows } = await query(
    `SELECT r.rated_user_id, u.email,
            ROUND(AVG(r.responsiveness_score)::numeric, 2) AS avg_score,
            COUNT(*)::int AS n
       FROM ratings r JOIN users u ON u.id = r.rated_user_id
      WHERE r.deleted_at IS NULL
      GROUP BY r.rated_user_id, u.email
      ORDER BY avg_score ASC`,
  );
  return rows.map((r) => ({
    userId: r.rated_user_id,
    email: r.email,
    avgScore: Number(r.avg_score),
    ratingCount: r.n,
    flagged: Number(r.avg_score) < 3, // low performer flag
  }));
}

export const STAFF_TITLES = ['home_specialist', 'credit_specialist', 'budget_specialist', 'realestate_specialist', 'manager'];

/**
 * Team role editor (screen 24): a manager changes a staff member's role, title,
 * capacity target, or status in place. Managers cannot grant admin; admin can.
 */
export async function updateStaff(actor, userId, { role, title, capacityTarget, status }) {
  if (role && !['specialist', 'manager', 'admin'].includes(role)) throw new ValidationError('Role must be specialist, manager, or admin');
  if (role === 'admin' && actor.role !== 'admin') throw new ForbiddenError('Only an admin can grant admin');
  if (title && !STAFF_TITLES.includes(title)) throw new ValidationError('Unknown title');
  if (status && !['active', 'suspended'].includes(status)) throw new ValidationError('Status must be active or suspended');
  if (capacityTarget !== undefined && (capacityTarget < 1 || capacityTarget > 60)) throw new ValidationError('Capacity target must be 1-60');
  if (userId === actor.userId && (role || status)) throw new ForbiddenError('You cannot change your own role or status');

  const { rows: target } = await query(`SELECT id, role FROM users WHERE id = $1 AND deleted_at IS NULL`, [userId]);
  if (!target[0]) throw new NotFoundError('Staff member not found');
  if (target[0].role === 'admin' && actor.role !== 'admin') throw new ForbiddenError('Only an admin can edit an admin');

  await withTransaction(async (q) => {
    await q(
      `UPDATE users SET role = COALESCE($2, role), status = COALESCE($3, status) WHERE id = $1`,
      [userId, role ?? null, status ?? null],
    );
    await q(
      `INSERT INTO staff (user_id, title, capacity_target) VALUES ($1, COALESCE($2, 'home_specialist'), COALESCE($3, 12))
       ON CONFLICT (user_id) WHERE deleted_at IS NULL DO UPDATE
         SET title = COALESCE($2, staff.title), capacity_target = COALESCE($3, staff.capacity_target)`,
      [userId, title ?? null, capacityTarget ?? null],
    );
  });
  await audit({
    actorUserId: actor.userId, actorRole: actor.role, action: 'operator.staff_updated',
    entityType: 'user', entityId: userId, metadata: { role, title, capacityTarget, status },
    ip: actor.reqMeta?.ip ?? null, userAgent: actor.reqMeta?.userAgent ?? null,
  });
  return (await capacity()).find((c) => c.userId === userId) ?? null;
}
