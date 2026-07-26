import { env } from '../../config/env.js';
import { createMockCreditBureauAdapter } from './mock.js';

/**
 * Adapter selector for the credit-bureau integration (spec §11.4: all third parties
 * behind a swappable adapter). Real providers register here; business logic only ever
 * sees the normalized interface { name, pullReport(member) }.
 */
let cached;

export function getCreditBureauAdapter() {
  if (cached) return cached;
  switch (env.adapters.creditBureau) {
    case 'mock':
      cached = createMockCreditBureauAdapter();
      break;
    // case 'array': cached = createArrayAdapter(); break;  // real provider (future)
    default:
      throw new Error(`Unknown CREDIT_BUREAU_ADAPTER: ${env.adapters.creditBureau}`);
  }
  return cached;
}
