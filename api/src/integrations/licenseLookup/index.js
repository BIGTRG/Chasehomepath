import { env } from '../../config/env.js';

/**
 * License verification adapter (spec §10: NCREC / NMLS lookups) — swappable. Real estate
 * (NCREC) and mortgage (NMLS) numbers are validated + status-checked before provisioning
 * (spec §8 "License verification"). Mock verifies any well-formed number as active.
 */
function createMockLicenseAdapter() {
  return {
    name: 'mock',
    /** verify({ licenseType, number }) -> { status, verifiedAt } */
    async verify({ number }) {
      const ok = typeof number === 'string' && number.trim().length >= 4;
      return { status: ok ? 'active' : 'inactive', verifiedAt: ok ? new Date().toISOString() : null };
    },
  };
}

let cached;
export function getLicenseAdapter() {
  if (cached) return cached;
  switch (env.adapters.licenseLookup) {
    case 'mock':
      cached = createMockLicenseAdapter();
      break;
    default:
      throw new Error(`Unknown LICENSE_LOOKUP_ADAPTER: ${env.adapters.licenseLookup}`);
  }
  return cached;
}
