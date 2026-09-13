import { env } from '../../config/env.js';
import { createMockPaymentAdapter } from './mock.js';
import { createStripePaymentAdapter } from './stripe.js';

/**
 * Payment processor adapter (subscriptions + one-off charges). Business logic only
 * sees this interface; the vendor is swappable via PAYMENT_ADAPTER without touching
 * billing.service.js.
 *
 * Interface:
 *   name
 *   publicConfig()                       -> { publishableKey? }  (safe for the browser)
 *   createCustomer({ email, name, memberId })      -> { customerId }
 *   attachPaymentMethod({ customerId, paymentMethodToken }) -> { paymentMethodId, label }
 *   createSubscription({ customerId, paymentMethodId, planCode, priceCents, metadata })
 *        -> { subscriptionId, periodStart, periodEnd, invoiceRef, status }
 *   cancelSubscription({ subscriptionId, atPeriodEnd }) -> { status, cancelAt }
 *   charge({ customerId, paymentMethodId, amountCents, description, metadata })
 *        -> { chargeRef, status }
 *   refund({ chargeRef, amountCents }) -> { refundRef, status }
 *   verifyWebhook(rawBody, signature)   -> event { id, type, data } | throws
 */
let cached;
export function getPaymentAdapter() {
  if (cached) return cached;
  switch (env.adapters.payment) {
    case 'mock':
      cached = createMockPaymentAdapter();
      break;
    case 'stripe':
      cached = createStripePaymentAdapter(env.payments.stripe);
      break;
    default:
      throw new Error(`Unknown PAYMENT_ADAPTER: ${env.adapters.payment}`);
  }
  return cached;
}
