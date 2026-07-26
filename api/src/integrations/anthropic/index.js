import { env } from '../../config/env.js';
import { createMockAnthropicAdapter } from './mock.js';

/** Adapter selector for the Anthropic API (the member AI agent). Swap via ANTHROPIC_ADAPTER. */
let cached;

export function getAnthropicAdapter() {
  if (cached) return cached;
  switch (env.adapters.anthropic) {
    case 'mock':
      cached = createMockAnthropicAdapter();
      break;
    default:
      throw new Error(`Unknown ANTHROPIC_ADAPTER: ${env.adapters.anthropic}`);
  }
  return cached;
}
