import { env } from '../../config/env.js';
import { createMockMlsAdapter } from './mock.js';

/** Adapter selector for the MLS feed (RESO Web API / IDX). Swap via MLS_ADAPTER. */
let cached;

export function getMlsAdapter() {
  if (cached) return cached;
  switch (env.adapters.mls) {
    case 'mock':
      cached = createMockMlsAdapter();
      break;
    default:
      throw new Error(`Unknown MLS_ADAPTER: ${env.adapters.mls}`);
  }
  return cached;
}
