import { query } from '../db/pool.js';
import { hashPassword } from '../auth/password.js';
import { ConflictError, NotFoundError } from '../lib/errors.js';

const PUBLIC_COLUMNS = 'id, email, phone, role, status, mfa_enabled, last_login_at, created_at';

export async function findByEmail(email, { withSecret = false } = {}) {
  const cols = withSecret ? `${PUBLIC_COLUMNS}, password_hash, mfa_secret` : PUBLIC_COLUMNS;
  const { rows } = await query(
    `SELECT ${cols} FROM users WHERE email = $1 AND deleted_at IS NULL`,
    [email],
  );
  return rows[0] ?? null;
}

export async function findById(id, { withSecret = false } = {}) {
  const cols = withSecret ? `${PUBLIC_COLUMNS}, password_hash, mfa_secret` : PUBLIC_COLUMNS;
  const { rows } = await query(
    `SELECT ${cols} FROM users WHERE id = $1 AND deleted_at IS NULL`,
    [id],
  );
  return rows[0] ?? null;
}

/**
 * Create a user. `db` may be a transaction-bound query fn so the caller can create
 * the user and its role profile (member/staff/partner) atomically.
 */
export async function createUser({ email, phone = null, password, role, status = 'active' }, db = query) {
  const existing = await findByEmail(email);
  if (existing) throw new ConflictError('An account with that email already exists', 'email_taken');

  const passwordHash = await hashPassword(password);
  const { rows } = await db(
    `INSERT INTO users (email, phone, password_hash, role, status)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING ${PUBLIC_COLUMNS}`,
    [email, phone, passwordHash, role, status],
  );
  return rows[0];
}

export async function markLoggedIn(userId, db = query) {
  await db(`UPDATE users SET last_login_at = now() WHERE id = $1`, [userId]);
}

export async function enableMfa(userId, encryptedSecret, db = query) {
  const { rowCount } = await db(
    `UPDATE users SET mfa_enabled = true, mfa_secret = $2 WHERE id = $1 AND deleted_at IS NULL`,
    [userId, encryptedSecret],
  );
  if (rowCount === 0) throw new NotFoundError('User not found');
}

export async function disableMfa(userId, db = query) {
  await db(`UPDATE users SET mfa_enabled = false, mfa_secret = NULL WHERE id = $1`, [userId]);
}

/** Shape a user row for API responses — never leak password_hash / mfa_secret. */
export function toPublic(user) {
  if (!user) return null;
  const { password_hash: _p, mfa_secret: _m, ...safe } = user;
  return safe;
}
