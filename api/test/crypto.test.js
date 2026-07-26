import './setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { encrypt, decrypt, isEncrypted, blindIndex } from '../src/lib/crypto.js';

test('encrypt/decrypt round-trips a string', () => {
  const plain = '123-45-6789';
  const ct = encrypt(plain);
  assert.notEqual(ct, plain);
  assert.ok(isEncrypted(ct));
  assert.equal(decrypt(ct), plain);
});

test('ciphertext is non-deterministic (fresh IV each time)', () => {
  assert.notEqual(encrypt('same'), encrypt('same'));
});

test('null and undefined pass through as null', () => {
  assert.equal(encrypt(null), null);
  assert.equal(encrypt(undefined), null);
  assert.equal(decrypt(null), null);
});

test('tampering with ciphertext is detected (GCM auth tag)', () => {
  const ct = encrypt('secret');
  const parts = ct.split('.');
  // Flip a character in the ciphertext segment.
  parts[4] = parts[4].slice(0, -1) + (parts[4].endsWith('A') ? 'B' : 'A');
  assert.throws(() => decrypt(parts.join('.')));
});

test('malformed input throws rather than returning garbage', () => {
  assert.throws(() => decrypt('not-encrypted'));
});

test('blindIndex is deterministic and non-reversible-looking', () => {
  const a = blindIndex('123-45-6789');
  const b = blindIndex('123-45-6789');
  assert.equal(a, b);
  assert.notEqual(a, blindIndex('123-45-6780'));
  assert.match(a, /^[0-9a-f]{64}$/);
});
