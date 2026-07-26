import { env } from '../../config/env.js';
import { createMockPlaidAdapter } from './mock.js';

/**
 * Adapter selector for Plaid (bank linking, transactions, income/asset verification).
 * Business logic only sees the normalized interface; swap providers via PLAID_ADAPTER.
 */
let cached;

export function getPlaidAdapter() {
  if (cached) return cached;
  switch (env.adapters.plaid) {
    case 'mock':
      cached = createMockPlaidAdapter();
      break;
    default:
      throw new Error(`Unknown PLAID_ADAPTER: ${env.adapters.plaid}`);
  }
  return cached;
}
