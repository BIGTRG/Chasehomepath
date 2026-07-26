import { query } from '../db/pool.js';
import { audit } from '../lib/audit.js';
import { NotFoundError, ValidationError } from '../lib/errors.js';
import { ROLES } from '../auth/rbac.js';

/** HQ admin board (spec §5.7): user/role administration. */
export async function listUsers({ role } = {}) {
  const params = [];
  const where = ['deleted_at IS NULL'];
  if (role) { params.push(role); where.push(`role = $${params.length}`); }
  const { rows } = await query(
    `SELECT id, email, role, status, mfa_enabled, created_at FROM users
      WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT 500`,
    params,
  );
  return rows;
}

export async function setUserRoleStatus(userId, { role, status }, actor) {
  if (role && !ROLES.includes(role)) throw new ValidationError('Unknown role');
  if (status && !['pending', 'active', 'suspended', 'disabled'].includes(status)) {
    throw new ValidationError('Unknown status');
  }
  const { rows } = await query(
    `UPDATE users SET role = COALESCE($2, role), status = COALESCE($3, status)
      WHERE id = $1 AND deleted_at IS NULL RETURNING id, email, role, status`,
    [userId, role ?? null, status ?? null],
  );
  if (!rows[0]) throw new NotFoundError('User not found');
  await audit({ actorUserId: actor.userId, actorRole: actor.role, action: 'admin.user_updated', entityType: 'user', entityId: userId, metadata: { role, status }, ...actor.reqMeta });
  return rows[0];
}

/** Program config (spec §5.7): assistance program rules are data and editable here. */
export async function listPrograms() {
  const { rows } = await query(
    `SELECT id, name, source, rules_json, active FROM assistance_programs WHERE deleted_at IS NULL ORDER BY name`,
  );
  return rows;
}

export async function upsertProgram({ id, name, source, rulesJson, active }, actor) {
  if (id) {
    const { rows } = await query(
      `UPDATE assistance_programs SET name = COALESCE($2,name), source = COALESCE($3,source),
              rules_json = COALESCE($4,rules_json), active = COALESCE($5,active)
        WHERE id = $1 AND deleted_at IS NULL RETURNING id, name, source, rules_json, active`,
      [id, name ?? null, source ?? null, rulesJson ? JSON.stringify(rulesJson) : null, active ?? null],
    );
    if (!rows[0]) throw new NotFoundError('Program not found');
    await audit({ actorUserId: actor.userId, actorRole: actor.role, action: 'admin.program_updated', entityType: 'assistance_program', entityId: id, ...actor.reqMeta });
    return rows[0];
  }
  const { rows } = await query(
    `INSERT INTO assistance_programs (name, source, rules_json, active)
     VALUES ($1,$2,$3,COALESCE($4,true)) RETURNING id, name, source, rules_json, active`,
    [name, source, JSON.stringify(rulesJson ?? {}), active ?? null],
  );
  await audit({ actorUserId: actor.userId, actorRole: actor.role, action: 'admin.program_created', entityType: 'assistance_program', entityId: rows[0].id, ...actor.reqMeta });
  return rows[0];
}

// ── Inventory management (spec §5.5) ──

export async function listInventory({ type, source, status } = {}) {
  const params = [];
  const where = ['deleted_at IS NULL'];
  for (const [col, val] of [['type', type], ['source', source], ['status', status]]) {
    if (val) { params.push(val); where.push(`${col} = $${params.length}`); }
  }
  const { rows } = await query(
    `SELECT id, type, source, status, price, address, beds, baths, sqft, mls_ref, partner_id
       FROM listings WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT 500`,
    params,
  );
  return rows;
}

export async function retireListing(id, actor) {
  const { rows } = await query(
    `UPDATE listings SET status = 'retired' WHERE id = $1 AND deleted_at IS NULL RETURNING id, status`,
    [id],
  );
  if (!rows[0]) throw new NotFoundError('Listing not found');
  await audit({ actorUserId: actor.userId, actorRole: actor.role, action: 'listing.retired', entityType: 'listing', entityId: id, ...actor.reqMeta });
  return rows[0];
}
