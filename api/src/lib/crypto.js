import crypto from 'node:crypto';
import { env } from '../config/env.js';

/**
 * Column-level encryption (Section 8: "SSNs, credit data, bank tokens, payroll —
 * encrypted at rest (column-level) and in transit. GLBA-grade.").
 *
 * Algorithm: AES-256-GCM (authenticated). Stored format is a self-describing string:
 *
 *     v1.<keyId>.<iv_b64url>.<tag_b64url>.<ciphertext_b64url>
 *
 * The keyId lets us rotate keys without re-reading which key encrypted a given row:
 * old rows decrypt with their original key, new rows encrypt with the active key.
 * Add keys as ENCRYPTION_KEY (id 1), ENCRYPTION_KEY_2, ENCRYPTION_KEY_3, ...
 */

const ALGO = 'aes-256-gcm';
const IV_BYTES = 12; // GCM standard nonce length
const PREFIX = 'v1';

function loadKeys() {
  const keys = new Map();
  for (const [name, value] of Object.entries(process.env)) {
    let id = null;
    if (name === 'ENCRYPTION_KEY') id = 1;
    else {
      const m = name.match(/^ENCRYPTION_KEY_(\d+)$/);
      // ENCRYPTION_KEY_ACTIVE is not a key; guard against the numeric-only match.
      if (m) id = Number.parseInt(m[1], 10);
    }
    if (id === null || !value) continue;
    const raw = Buffer.from(value, 'base64');
    if (raw.length !== 32) {
      throw new Error(
        `${name} must decode to exactly 32 bytes (got ${raw.length}). ` +
          'Generate with: openssl rand -base64 32',
      );
    }
    keys.set(id, raw);
  }
  return keys;
}

const KEYS = loadKeys();
const ACTIVE_KEY_ID = env.encryption.activeKeyId;

if (!KEYS.has(ACTIVE_KEY_ID) && !env.isTest) {
  throw new Error(
    `No encryption key found for ENCRYPTION_KEY_ACTIVE=${ACTIVE_KEY_ID}. ` +
      'Set ENCRYPTION_KEY (and matching ENCRYPTION_KEY_ACTIVE).',
  );
}

function keyFor(id) {
  const key = KEYS.get(id);
  if (!key) throw new Error(`Encryption key id ${id} is not configured`);
  return key;
}

const b64u = (buf) => buf.toString('base64url');
const fromB64u = (str) => Buffer.from(str, 'base64url');

/**
 * Encrypt a UTF-8 string. Returns null for null/undefined so nullable columns
 * round-trip cleanly. Non-strings are JSON-stringified by the caller if needed.
 */
export function encrypt(plaintext) {
  if (plaintext === null || plaintext === undefined) return null;
  const keyId = ACTIVE_KEY_ID;
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGO, keyFor(keyId), iv);
  const ct = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [PREFIX, keyId, b64u(iv), b64u(tag), b64u(ct)].join('.');
}

/** Decrypt a value produced by encrypt(). Returns null for null input. */
export function decrypt(stored) {
  if (stored === null || stored === undefined) return null;
  const parts = String(stored).split('.');
  if (parts.length !== 5 || parts[0] !== PREFIX) {
    throw new Error('Ciphertext is malformed or not v1-encrypted');
  }
  const [, keyIdStr, ivStr, tagStr, ctStr] = parts;
  const decipher = crypto.createDecipheriv(ALGO, keyFor(Number.parseInt(keyIdStr, 10)), fromB64u(ivStr));
  decipher.setAuthTag(fromB64u(tagStr));
  const pt = Buffer.concat([decipher.update(fromB64u(ctStr)), decipher.final()]);
  return pt.toString('utf8');
}

/** True if a stored value looks like our ciphertext (cheap format check). */
export function isEncrypted(value) {
  return typeof value === 'string' && value.startsWith(`${PREFIX}.`);
}

/**
 * Deterministic blind index for searchable encrypted columns (e.g. look up a row
 * by SSN without decrypting every row). HMAC-SHA256 keyed by the active key.
 * Same input -> same index, but the index is not reversible.
 */
export function blindIndex(value) {
  if (value === null || value === undefined) return null;
  return crypto.createHmac('sha256', keyFor(ACTIVE_KEY_ID)).update(String(value)).digest('hex');
}

export default { encrypt, decrypt, isEncrypted, blindIndex };
