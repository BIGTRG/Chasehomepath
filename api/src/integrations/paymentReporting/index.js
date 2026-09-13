import { env } from '../../config/env.js';

/**
 * Payment-reporting (furnisher) adapter. Turns a queued on-time plan payment into a
 * report to whatever furnishing path is connected. `mock` records the event and
 * returns a reference; nothing leaves the system. Swappable via PAYMENT_REPORTING_ADAPTER.
 *
 * Interface: name, async report({ member, event }) -> { externalRef, status: 'sent'|'acknowledged' }
 */
function createMockReportingAdapter() {
  return {
    name: 'mock',
    async report({ event }) {
      return { externalRef: `rpt_mock_${event.id.slice(0, 8)}`, status: 'acknowledged' };
    },
  };
}

let cached;
export function getPaymentReportingAdapter() {
  if (cached) return cached;
  switch (env.adapters.paymentReporting) {
    case 'mock':
      cached = createMockReportingAdapter();
      break;
    default:
      throw new Error(`Unknown PAYMENT_REPORTING_ADAPTER: ${env.adapters.paymentReporting}`);
  }
  return cached;
}
