import { authenticator } from 'otplib';
import qrcode from 'qrcode';
import { env } from '../config/env.js';
import { encrypt, decrypt } from '../lib/crypto.js';

/**
 * TOTP-based MFA (spec §4.1: "MFA, biometric option"). The shared secret is stored
 * encrypted at rest (AES-256-GCM) — never in plaintext.
 *
 * Biometric login is a client-side unlock over the same credentials; the server
 * contract is the TOTP second factor implemented here.
 */

// Allow a 1-step window for clock drift.
authenticator.options = { window: 1 };

export function generateSecret() {
  return authenticator.generateSecret();
}

/** otpauth:// URI + a data-URL QR image the client renders during enrollment. */
export async function buildEnrollment(user, secret) {
  const label = user.email;
  const otpauth = authenticator.keyuri(label, env.auth.mfaIssuer, secret);
  const qrDataUrl = await qrcode.toDataURL(otpauth);
  return { otpauth, qrDataUrl };
}

export function verifyToken(token, secret) {
  if (!token || !secret) return false;
  try {
    return authenticator.verify({ token: String(token).trim(), secret });
  } catch {
    return false;
  }
}

export const encryptSecret = (secret) => encrypt(secret);
export const decryptSecret = (stored) => decrypt(stored);
