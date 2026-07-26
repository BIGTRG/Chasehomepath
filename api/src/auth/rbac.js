/**
 * Roles and access helpers (spec §2: three surfaces, one system).
 *
 *   member      → member app
 *   specialist  → operator console (own clients)
 *   manager     → operator console (office)
 *   admin       → HQ admin board (cross-office)
 *   partner     → partner portal
 */
export const ROLES = Object.freeze(['member', 'specialist', 'manager', 'admin', 'partner']);

// Surface groupings used by route guards.
export const OPERATOR_ROLES = Object.freeze(['specialist', 'manager', 'admin']);
export const STAFF_ROLES = Object.freeze(['specialist', 'manager', 'admin']);

export function isRole(user, ...roles) {
  return Boolean(user) && roles.includes(user.role);
}

export function isOperator(user) {
  return isRole(user, ...OPERATOR_ROLES);
}
