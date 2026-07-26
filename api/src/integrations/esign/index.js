import { env } from '../../config/env.js';

/**
 * E-signature adapter (spec §10, §11.4) — swappable. Mock returns a signed reference so
 * agreements/disclosures flow without a real e-sign provider.
 */
function createMockEsignAdapter() {
  return {
    name: 'mock',
    /** Create + "sign" a document. Returns a reference stored encrypted by the caller. */
    async sign({ type, userId }) {
      return { documentRef: `esign:mock:${type}:${userId}`, esignedAt: new Date().toISOString() };
    },
  };
}

let cached;
export function getEsignAdapter() {
  if (cached) return cached;
  switch (env.adapters.esign) {
    case 'mock':
      cached = createMockEsignAdapter();
      break;
    default:
      throw new Error(`Unknown ESIGN_ADAPTER: ${env.adapters.esign}`);
  }
  return cached;
}
