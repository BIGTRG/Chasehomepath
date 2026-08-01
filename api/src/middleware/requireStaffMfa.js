import { env } from '../config/env.js';
import { ForbiddenError } from '../lib/errors.js';

/**
 * GLBA Safeguards posture: staff access to member data requires MFA.
 * When enforcement is on (REQUIRE_STAFF_MFA, default on in production), staff
 * accounts without MFA enabled can still log in and reach /auth/mfa/* to enroll,
 * but every operator route answers 403 mfa_required until they finish.
 */
export function requireStaffMfa(req, _res, next) {
  if (!env.auth.requireStaffMfa) return next();
  if (req.user && !req.user.mfa_enabled) {
    return next(new ForbiddenError('Multi-factor authentication is required for staff accounts', 'mfa_enrollment_required'));
  }
  next();
}
