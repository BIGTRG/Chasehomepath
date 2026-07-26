import { verifyAccessToken } from '../auth/tokens.js';
import { AuthError } from '../lib/errors.js';
import { query } from '../db/pool.js';

/**
 * Populate req.user from the Bearer access token. Rejects missing/invalid tokens.
 * Confirms the user still exists and is active on every request (cheap, indexed).
 */
export async function authenticate(req, _res, next) {
  try {
    const header = req.get('authorization') || '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) {
      throw new AuthError('Missing Bearer token');
    }

    let payload;
    try {
      payload = verifyAccessToken(token);
    } catch {
      throw new AuthError('Invalid or expired token', 'token_invalid');
    }

    const { rows } = await query(
      `SELECT id, email, role, status FROM users WHERE id = $1 AND deleted_at IS NULL`,
      [payload.sub],
    );
    const user = rows[0];
    if (!user) throw new AuthError('User no longer exists', 'user_gone');
    if (user.status !== 'active') throw new AuthError('Account is not active', 'account_inactive');

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

/** Optional auth: attach req.user if a valid token is present, else continue anonymously. */
export async function optionalAuthenticate(req, _res, next) {
  const header = req.get('authorization') || '';
  if (!header.startsWith('Bearer ')) return next();
  return authenticate(req, _res, next);
}
