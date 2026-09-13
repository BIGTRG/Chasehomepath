import { env } from '../../config/env.js';

/**
 * Credit-monitoring adapter: pulls current bureau scores for an enrolled member.
 * `mock` returns nothing (we never invent a score); `smartcredit` lands when
 * ConsumerDirect grants partner API access. Same interface either way, so the
 * vendor can be swapped without touching services.
 */
export function getCreditMonitoringAdapter() {
  const kind = env.adapters.creditMonitoring;
  if (kind === 'smartcredit') {
    return {
      name: 'smartcredit',
      async fetchScores() { throw new Error('SmartCredit partner API not yet provisioned'); },
    };
  }
  return { name: 'mock', async fetchScores() { return []; } };
}
