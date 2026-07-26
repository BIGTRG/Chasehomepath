import { ForbiddenError, AuthError } from '../lib/errors.js';

/**
 * Route guard: require the authenticated user to hold one of the given roles.
 * Use after authenticate(). Example: authorize('manager', 'admin').
 */
export function authorize(...roles) {
  return (req, _res, next) => {
    if (!req.user) return next(new AuthError());
    if (!roles.includes(req.user.role)) {
      return next(new ForbiddenError(`Requires role: ${roles.join(' or ')}`));
    }
    next();
  };
}
