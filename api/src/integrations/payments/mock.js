import { randomUUID } from 'node:crypto';
import { ValidationError } from '../../lib/errors.js';

/**
 * Mock processor. Deterministic and offline. Accepts payment-method tokens of the form
 *   pm_mock_<last4>            -> succeeds, label "Card ending <last4>"
 *   pm_mock_declined           -> every charge fails (for tests / demo)
 * Period math mirrors Stripe: monthly anchor on the signup timestamp.
 */
export function createMockPaymentAdapter() {
  const declined = new Set();
  return {
    name: 'mock',
    publicConfig() {
      return { mode: 'mock' };
    },
    async createCustomer({ email }) {
      return { customerId: `cus_mock_${randomUUID().slice(0, 8)}`, email };
    },
    async attachPaymentMethod({ paymentMethodToken }) {
      if (!/^pm_mock_/.test(paymentMethodToken || '')) throw new ValidationError('Invalid payment method token');
      const id = `pm_${randomUUID().slice(0, 12)}`;
      if (paymentMethodToken === 'pm_mock_declined') declined.add(id);
      const last4 = paymentMethodToken.replace('pm_mock_', '').slice(-4);
      return { paymentMethodId: id, label: declined.has(id) ? 'Card (declined test)' : `Card ending ${last4}` };
    },
    async createSubscription({ paymentMethodId, priceCents }) {
      if (declined.has(paymentMethodId)) {
        return { subscriptionId: null, status: 'failed', failureReason: 'card_declined' };
      }
      const start = new Date();
      const end = new Date(start);
      end.setMonth(end.getMonth() + 1);
      return {
        subscriptionId: `sub_mock_${randomUUID().slice(0, 8)}`,
        status: 'active',
        periodStart: start.toISOString(),
        periodEnd: end.toISOString(),
        invoiceRef: `in_mock_${randomUUID().slice(0, 10)}`,
        amountCents: priceCents,
      };
    },
    async cancelSubscription({ atPeriodEnd }) {
      return { status: atPeriodEnd ? 'active' : 'cancelled' };
    },
    async charge({ paymentMethodId, amountCents }) {
      if (declined.has(paymentMethodId)) return { chargeRef: null, status: 'failed', failureReason: 'card_declined' };
      return { chargeRef: `ch_mock_${randomUUID().slice(0, 10)}`, status: 'succeeded', amountCents };
    },
    async refund({ chargeRef }) {
      return { refundRef: `re_mock_${randomUUID().slice(0, 10)}`, status: 'refunded', chargeRef };
    },
    verifyWebhook(rawBody) {
      return JSON.parse(rawBody.toString('utf8'));
    },
  };
}
