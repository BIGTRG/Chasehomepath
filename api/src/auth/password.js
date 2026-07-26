import bcrypt from 'bcryptjs';

const ROUNDS = 12;

// Basic strength floor. UI enforces more; this is the server backstop.
const MIN_LENGTH = 10;

export function validatePasswordStrength(password) {
  if (typeof password !== 'string' || password.length < MIN_LENGTH) {
    return { ok: false, reason: `Password must be at least ${MIN_LENGTH} characters` };
  }
  return { ok: true };
}

export async function hashPassword(password) {
  return bcrypt.hash(password, ROUNDS);
}

export async function verifyPassword(password, hash) {
  if (!hash) return false;
  return bcrypt.compare(password, hash);
}
