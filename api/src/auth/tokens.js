import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { query } from '../db/pool.js';

/**
 * Access tokens are short-lived JWTs (stateless). Refresh tokens are opaque random
 * strings stored hashed in refresh_tokens and rotated on every use.
 */

export function signAccessToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, typ: 'access' },
    env.auth.accessSecret,
    { expiresIn: env.auth.accessTtl },
  );
}

export function verifyAccessToken(token) {
  const payload = jwt.verify(token, env.auth.accessSecret);
  if (payload.typ !== 'access') throw new Error('Wrong token type');
  return payload;
}

function hashToken(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

/** Issue a refresh token, persist its hash, return the raw value (shown once). */
export async function issueRefreshToken(userId, { ip = null, userAgent = null } = {}, db = query) {
  const raw = crypto.randomBytes(48).toString('base64url');
  const expiresAt = new Date(Date.now() + env.auth.refreshTtl * 1000);
  const { rows } = await db(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, ip, user_agent)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [userId, hashToken(raw), expiresAt, ip, userAgent],
  );
  return { raw, id: rows[0].id, expiresAt };
}

/**
 * Rotate a refresh token: validate the presented raw token, revoke it, issue a new
 * one, and link them. Returns { userId, refresh } or throws on invalid/expired/reused.
 */
export async function rotateRefreshToken(raw, meta = {}, db = query) {
  const { rows } = await db(
    `SELECT id, user_id, expires_at, revoked_at FROM refresh_tokens WHERE token_hash = $1`,
    [hashToken(raw)],
  );
  const row = rows[0];
  if (!row) throw new Error('Refresh token not recognized');
  if (row.revoked_at) throw new Error('Refresh token already used');
  if (new Date(row.expires_at) < new Date()) throw new Error('Refresh token expired');

  const next = await issueRefreshToken(row.user_id, meta, db);
  await db(`UPDATE refresh_tokens SET revoked_at = now(), replaced_by = $2 WHERE id = $1`, [
    row.id,
    next.id,
  ]);
  return { userId: row.user_id, refresh: next };
}

export async function revokeRefreshToken(raw, db = query) {
  await db(`UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL`, [
    hashToken(raw),
  ]);
}

export async function revokeAllForUser(userId, db = query) {
  await db(`UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, [
    userId,
  ]);
}
