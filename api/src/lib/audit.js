import { query } from '../db/pool.js';

/**
 * Write an immutable audit record. The audit trail is a compliance non-negotiable
 * (spec §11): disputes, onboarding gates, and rule enforcement all leave a trace.
 *
 * Pass `db` (a transaction-bound query fn) to record the event in the SAME
 * transaction as the action it describes — so the action and its trace commit or
 * roll back together.
 */
export async function audit(
  { actorUserId = null, actorRole = null, action, entityType = null, entityId = null, metadata = {}, ip = null, userAgent = null },
  db = query,
) {
  if (!action) throw new Error('audit() requires an action');
  await db(
    `INSERT INTO audit_log
       (actor_user_id, actor_role, action, entity_type, entity_id, metadata, ip, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [actorUserId, actorRole, action, entityType, entityId, metadata, ip, userAgent],
  );
}

/** Convenience: build the actor fields from a request's authenticated user. */
export function actorFrom(req) {
  return {
    actorUserId: req.user?.id ?? null,
    actorRole: req.user?.role ?? null,
    ip: req.ip ?? null,
    userAgent: req.get?.('user-agent') ?? null,
  };
}

export default audit;
