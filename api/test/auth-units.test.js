import './setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword, validatePasswordStrength } from '../src/auth/password.js';
import { signAccessToken, verifyAccessToken } from '../src/auth/tokens.js';
import { generateSecret, verifyToken } from '../src/auth/mfa.js';
import { authenticator } from 'otplib';

test('password hashing verifies correctly and rejects wrong password', async () => {
  const hash = await hashPassword('correcthorse1');
  assert.equal(await verifyPassword('correcthorse1', hash), true);
  assert.equal(await verifyPassword('wrong', hash), false);
});

test('password strength floor rejects short passwords', () => {
  assert.equal(validatePasswordStrength('short').ok, false);
  assert.equal(validatePasswordStrength('longenough1').ok, true);
});

test('access token signs and verifies with role claim', () => {
  const token = signAccessToken({ id: 'u1', role: 'member' });
  const payload = verifyAccessToken(token);
  assert.equal(payload.sub, 'u1');
  assert.equal(payload.role, 'member');
  assert.equal(payload.typ, 'access');
});

test('MFA verifies a valid TOTP code and rejects a bad one', () => {
  const secret = generateSecret();
  const code = authenticator.generate(secret);
  assert.equal(verifyToken(code, secret), true);
  assert.equal(verifyToken('000000', secret), false);
});
