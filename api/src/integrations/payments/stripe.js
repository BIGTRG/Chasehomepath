import { createHmac, timingSafeEqual } from 'node:crypto';
import { URLSearchParams } from 'node:url';
import { AppError, ValidationError } from '../../lib/errors.js';

/**
 * Stripe adapter over the REST API (no SDK: smaller audit surface, and the base URL
 * can point at the GE API Engine proxy so the secret key lives in the engine vault).
 *
 * Env: STRIPE_SECRET_KEY, STRIPE_PUBLISHABLE_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_BASE_URL.
 * Prices are created ad hoc with price_data (one product per plan code) so no
 * dashboard setup is required beyond the account itself.
 */
export function createStripePaymentAdapter({ secretKey, publishableKey, webhookSecret, baseUrl }) {
  if (!secretKey) throw new Error('PAYMENT_ADAPTER=stripe requires STRIPE_SECRET_KEY');
  const base = (baseUrl || 'https://api.stripe.com').replace(/\/$/, '');

  function form(obj, prefix = '', out = new URLSearchParams()) {
    for (const [k, v] of Object.entries(obj)) {
      if (v === undefined || v === null) continue;
      const key = prefix ? `${prefix}[${k}]` : k;
      if (typeof v === 'object' && !Array.isArray(v)) form(v, key, out);
      else if (Array.isArray(v)) v.forEach((item, i) => (typeof item === 'object' ? form(item, `${key}[${i}]`, out) : out.append(`${key}[${i}]`, String(item))));
      else out.append(key, String(v));
    }
    return out;
  }

  async function call(method, path, body, idempotencyKey) {
    const headers = { authorization: `Bearer ${secretKey}`, 'stripe-version': '2024-06-20' };
    if (body) headers['content-type'] = 'application/x-www-form-urlencoded';
    if (idempotencyKey) headers['idempotency-key'] = idempotencyKey;
    const res = await fetch(`${base}/v1${path}`, { method, headers, body: body ? form(body) : undefined });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data?.error?.message || `Stripe ${res.status}`;
      if (data?.error?.type === 'card_error') throw new ValidationError(msg, { code: data.error.code });
      throw new AppError(msg, { status: 502, code: 'processor_error' });
    }
    return data;
  }

  return {
    name: 'stripe',
    publicConfig() {
      return { mode: 'stripe', publishableKey };
    },
    async createCustomer({ email, name, memberId }) {
      const c = await call('POST', '/customers', { email, name, metadata: { memberId } });
      return { customerId: c.id };
    },
    async attachPaymentMethod({ customerId, paymentMethodToken }) {
      const pm = await call('POST', `/payment_methods/${paymentMethodToken}/attach`, { customer: customerId });
      await call('POST', `/customers/${customerId}`, { invoice_settings: { default_payment_method: pm.id } });
      const card = pm.card || {};
      return { paymentMethodId: pm.id, label: card.brand ? `${cap(card.brand)} ending ${card.last4}` : 'Card on file' };
    },
    async createSubscription({ customerId, paymentMethodId, planCode, priceCents, metadata }) {
      const s = await call(
        'POST',
        '/subscriptions',
        {
          customer: customerId,
          default_payment_method: paymentMethodId,
          items: [{ price_data: { currency: 'usd', unit_amount: priceCents, recurring: { interval: 'month' }, product_data: { name: `CHASE HomePath ${cap(planCode)} plan` } } }],
          payment_behavior: 'error_if_incomplete',
          expand: ['latest_invoice'],
          metadata: { planCode, ...metadata },
        },
        `sub-${metadata?.memberId}-${Date.now()}`,
      );
      return {
        subscriptionId: s.id,
        status: s.status === 'active' || s.status === 'trialing' ? 'active' : 'failed',
        periodStart: new Date(s.current_period_start * 1000).toISOString(),
        periodEnd: new Date(s.current_period_end * 1000).toISOString(),
        invoiceRef: s.latest_invoice?.id || null,
        amountCents: priceCents,
      };
    },
    async cancelSubscription({ subscriptionId, atPeriodEnd }) {
      if (atPeriodEnd) {
        const s = await call('POST', `/subscriptions/${subscriptionId}`, { cancel_at_period_end: true });
        return { status: 'active', cancelAt: s.cancel_at ? new Date(s.cancel_at * 1000).toISOString() : null };
      }
      await call('DELETE', `/subscriptions/${subscriptionId}`);
      return { status: 'cancelled' };
    },
    async charge({ customerId, paymentMethodId, amountCents, description, metadata }) {
      const pi = await call('POST', '/payment_intents', {
        amount: amountCents, currency: 'usd', customer: customerId, payment_method: paymentMethodId,
        confirm: true, off_session: true, description, metadata,
      }, `pi-${metadata?.memberId}-${Date.now()}`);
      return { chargeRef: pi.id, status: pi.status === 'succeeded' ? 'succeeded' : 'failed', failureReason: pi.last_payment_error?.message, amountCents };
    },
    async refund({ chargeRef, amountCents }) {
      const r = await call('POST', '/refunds', { payment_intent: chargeRef, amount: amountCents });
      return { refundRef: r.id, status: 'refunded' };
    },
    verifyWebhook(rawBody, signature) {
      if (!webhookSecret) throw new AppError('Webhook secret not configured', { status: 500 });
      const parts = Object.fromEntries(String(signature || '').split(',').map((p) => p.split('=')));
      const payload = `${parts.t}.${rawBody.toString('utf8')}`;
      const expected = createHmac('sha256', webhookSecret).update(payload).digest('hex');
      const given = Buffer.from(parts.v1 || '', 'hex');
      const exp = Buffer.from(expected, 'hex');
      if (given.length !== exp.length || !timingSafeEqual(given, exp)) throw new AppError('Bad webhook signature', { status: 400, code: 'bad_signature' });
      if (Math.abs(Date.now() / 1000 - Number(parts.t)) > 300) throw new AppError('Stale webhook', { status: 400, code: 'stale_webhook' });
      return JSON.parse(rawBody.toString('utf8'));
    },
  };
}

const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
