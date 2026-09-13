import { query, withTransaction } from '../db/pool.js';
import { audit } from '../lib/audit.js';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../lib/errors.js';
import { getPaymentAdapter } from '../integrations/payments/index.js';
import { sendMail } from '../lib/mailer.js';
import { env } from '../config/env.js';
import { weekdaySlots } from '../lib/businessTime.js';
import { onSubscriptionPayment } from './paymentReporting.service.js';

/**
 * Billing (approved 2026-09-12): monthly plan subscriptions (Steady/Focused/Express),
 * cancel anytime, plus $89 pay-per-session 1:1 counseling as an independent add-on
 * on every tier. This is education and planning toward homeownership, not credit
 * repair: no fee here is for disputing or improving credit, and the AI dispute
 * helper stays free.
 *
 * FTC negative-option (auto-renew) rule: the consent text shown at checkout is
 * stored with the subscription, and cancellation is a single authenticated call.
 */

const money = (cents) => `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;

export async function listPlans() {
  const { rows } = await query(
    `SELECT code, name, target_months, price_cents, interval, tagline, features, highlight
       FROM billing_plans WHERE active ORDER BY sort_order`,
  );
  const session = await sessionSettings();
  return { plans: rows.map(planRow), session, processor: getPaymentAdapter().publicConfig() };
}

function planRow(r) {
  return {
    code: r.code, name: r.name, targetMonths: r.target_months, priceCents: r.price_cents,
    interval: r.interval, tagline: r.tagline, features: r.features, highlight: r.highlight,
  };
}

export async function sessionSettings() {
  const { rows } = await query(`SELECT value FROM billing_settings WHERE key = 'session'`);
  return rows[0]?.value ?? { priceCents: 8900, durationMin: 45, name: '1:1 counseling session' };
}

async function termsVersion() {
  const { rows } = await query(`SELECT value FROM billing_settings WHERE key = 'terms_version'`);
  return rows[0]?.value ?? 'unversioned';
}

/** Consent sentence rendered at checkout and stored verbatim (negative-option rule). */
export function consentText({ planName, priceCents, methodType = 'card' }) {
  const base = `I agree to pay ${money(priceCents)} per month for the CHASE HomePath ${planName} plan. ` +
    'This renews automatically each month until I cancel. I can cancel anytime in the app ' +
    'with one tap and will not be charged again after the current month. This plan is ' +
    'homeownership education and planning, not credit repair. No credit or purchase ' +
    'outcome is promised.';
  if (methodType !== 'bank') return base;
  // NACHA-required ACH debit authorization language.
  return `${base} I authorize CHASE HomePath (TRG Tech Link) to electronically debit my bank account ` +
    `for ${money(priceCents)} on or about the same day each month, and to debit any session I book at ` +
    'the price shown when I book it. This authorization stays in effect until I cancel in the app or ' +
    'notify support@chasehomepath.com, allowing reasonable time to act. If a debit is returned unpaid, ' +
    'I understand it may be retried once.';
}

async function liveSubscription(memberId) {
  const { rows } = await query(
    `SELECT s.*, p.name AS plan_name, p.target_months
       FROM subscriptions s JOIN billing_plans p ON p.code = s.plan_code
      WHERE s.member_id = $1 AND s.deleted_at IS NULL AND s.status <> 'cancelled'
      ORDER BY s.created_at DESC LIMIT 1`,
    [memberId],
  );
  return rows[0] ?? null;
}

function subView(s) {
  if (!s) return null;
  return {
    id: s.id, planCode: s.plan_code, planName: s.plan_name, targetMonths: s.target_months,
    status: s.status, priceCents: s.price_cents, paymentMethod: s.payment_method_label, paymentMethodType: s.payment_method_type ?? 'card',
    currentPeriodStart: s.current_period_start, currentPeriodEnd: s.current_period_end,
    cancelAtPeriodEnd: s.cancel_at_period_end, cancelledAt: s.cancelled_at, startedAt: s.created_at,
  };
}

/** Member billing overview: subscription, payments, sessions. */
export async function overview(memberId) {
  const sub = await liveSubscription(memberId);
  const [{ rows: payments }, { rows: sessions }, session] = await Promise.all([
    query(
      `SELECT id, kind, amount_cents, status, description, created_at, failure_reason
         FROM payments WHERE member_id = $1 ORDER BY created_at DESC LIMIT 24`,
      [memberId],
    ),
    query(
      `SELECT cs.id, cs.price_cents, cs.duration_min, cs.topic, cs.status, cs.created_at,
              cs.format, cs.topic_code, cs.room_code, cs.group_session_id, g.title AS group_title,
              a.scheduled_at, a.type, a.status AS appointment_status
         FROM counseling_sessions cs JOIN appointments a ON a.id = cs.appointment_id
         LEFT JOIN group_sessions g ON g.id = cs.group_session_id
        WHERE cs.member_id = $1 ORDER BY a.scheduled_at DESC LIMIT 24`,
      [memberId],
    ),
    sessionSettings(),
  ]);
  return {
    subscription: subView(sub),
    payments: payments.map((p) => ({
      id: p.id, kind: p.kind, amountCents: p.amount_cents, status: p.status,
      description: p.description, createdAt: p.created_at, failureReason: p.failure_reason,
    })),
    sessions: sessions.map(sessionView),
    session,
  };
}

function sessionView(s) {
  return {
    id: s.id, priceCents: s.price_cents, durationMin: s.duration_min, topic: s.topic,
    topicCode: s.topic_code ?? null, format: s.format ?? 'single', roomCode: s.room_code ?? null,
    groupSessionId: s.group_session_id ?? null, groupTitle: s.group_title ?? null,
    status: s.status, scheduledAt: s.scheduled_at, type: s.type, createdAt: s.created_at,
  };
}

/**
 * Subscribe a member to a plan. `paymentMethodToken` comes from the processor's
 * client-side tokenizer (card numbers never touch this server).
 */
export async function subscribe(member, { planCode, paymentMethodToken, consentAccepted }, actor) {
  if (!consentAccepted) throw new ValidationError('You must accept the plan terms to continue');
  const { rows: plans } = await query(`SELECT * FROM billing_plans WHERE code = $1 AND active`, [planCode]);
  const plan = plans[0];
  if (!plan) throw new NotFoundError('Plan not found');
  if (await liveSubscription(member.id)) throw new ConflictError('You already have an active plan. Change it from Billing.', 'already_subscribed');

  const processor = getPaymentAdapter();
  const { customerId } = await processor.createCustomer({ email: member.email, name: member.name, memberId: member.id });
  const pm = await processor.attachPaymentMethod({ customerId, paymentMethodToken });
  const text = consentText({ planName: plan.name, priceCents: plan.price_cents, methodType: pm.type ?? 'card' });
  const version = await termsVersion();

  const result = await processor.createSubscription({
    customerId, paymentMethodId: pm.paymentMethodId, planCode, priceCents: plan.price_cents,
    metadata: { memberId: member.id },
  });

  if (result.status !== 'active' && result.status !== 'pending') {
    await query(
      `INSERT INTO payments (member_id, kind, amount_cents, status, description, processor, processor_ref, failure_reason)
       VALUES ($1,'subscription',$2,'failed',$3,$4,$5,$6)`,
      [member.id, plan.price_cents, `${plan.name} plan, first month`, processor.name, result.invoiceRef ?? null, result.failureReason ?? 'declined'],
    );
    throw new ValidationError('Your card was declined. Try another card.', { code: 'card_declined' });
  }

  const sub = await withTransaction(async (q) => {
    const { rows } = await q(
      `INSERT INTO subscriptions (member_id, plan_code, status, price_cents, processor, processor_customer_id,
              processor_subscription_id, payment_method_label, payment_method_type, current_period_start, current_period_end,
              consent_text, consent_terms_version, consent_ip)
       VALUES ($1,$2,'active',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [member.id, planCode, plan.price_cents, processor.name, customerId, result.subscriptionId, pm.label, pm.type ?? 'card',
        result.periodStart, result.periodEnd, text, version, actor?.reqMeta?.ip ?? null],
    );
    await q(
      `INSERT INTO payments (member_id, subscription_id, kind, amount_cents, status, description, processor, processor_ref)
       VALUES ($1,$2,'subscription',$3,$7,$4,$5,$6)`,
      [member.id, rows[0].id, plan.price_cents, `${plan.name} plan, first month`, processor.name, result.invoiceRef ?? null, result.status === 'pending' ? 'pending' : 'succeeded'],
    );
    // Tier drives the milestone cadence elsewhere; keep members.membership_tier in step.
    await q(`UPDATE members SET membership_tier = $2 WHERE id = $1`, [member.id, { steady: 1, focused: 2, express: 3 }[planCode] ?? 1]);
    return rows[0];
  });

  await audit({
    actorUserId: actor?.userId ?? null, actorRole: actor?.role ?? null, action: 'billing.subscribed',
    entityType: 'subscription', entityId: sub.id, metadata: { planCode, priceCents: plan.price_cents, processor: processor.name },
    ip: actor?.reqMeta?.ip ?? null, userAgent: actor?.reqMeta?.userAgent ?? null,
  });
  onSubscriptionPayment(member.id);
  sendReceipt(member.email, {
    subject: `Your CHASE HomePath ${plan.name} plan is active`,
    lines: [
      `Plan: ${plan.name} (${plan.target_months}-month target)`,
      `Price: ${money(plan.price_cents)} per month, renews ${new Date(result.periodEnd).toLocaleDateString('en-US')}`,
      `Payment method: ${pm.label}`,
      '', 'Cancel anytime from Billing in the app. No charge after the current month.',
      '', 'CHASE HomePath is homeownership education and planning, not credit repair.',
    ],
  });
  return subView({ ...sub, plan_name: plan.name, target_months: plan.target_months });
}

/** One-tap cancel. Access continues to the end of the paid month. */
export async function cancel(memberId, actor) {
  const sub = await liveSubscription(memberId);
  if (!sub) throw new NotFoundError('No active plan');
  if (sub.cancel_at_period_end) return subView(sub);
  const processor = getPaymentAdapter();
  if (sub.processor_subscription_id) {
    await processor.cancelSubscription({ subscriptionId: sub.processor_subscription_id, atPeriodEnd: true });
  }
  const { rows } = await query(
    `UPDATE subscriptions SET cancel_at_period_end = true, cancelled_at = now() WHERE id = $1 RETURNING *`,
    [sub.id],
  );
  await audit({
    actorUserId: actor?.userId ?? null, actorRole: actor?.role ?? null, action: 'billing.cancelled',
    entityType: 'subscription', entityId: sub.id, metadata: { effective: sub.current_period_end },
    ip: actor?.reqMeta?.ip ?? null, userAgent: actor?.reqMeta?.userAgent ?? null,
  });
  return subView({ ...rows[0], plan_name: sub.plan_name, target_months: sub.target_months });
}

/** Undo a pending cancellation before the period ends. */
export async function resume(memberId, actor) {
  const sub = await liveSubscription(memberId);
  if (!sub || !sub.cancel_at_period_end) throw new NotFoundError('Nothing to resume');
  const { rows } = await query(
    `UPDATE subscriptions SET cancel_at_period_end = false, cancelled_at = NULL WHERE id = $1 RETURNING *`,
    [sub.id],
  );
  await audit({ actorUserId: actor?.userId ?? null, actorRole: actor?.role ?? null, action: 'billing.resumed', entityType: 'subscription', entityId: sub.id });
  return subView({ ...rows[0], plan_name: sub.plan_name, target_months: sub.target_months });
}

/** Switch plan (takes effect now; processor prorates on its side, we lock the new price). */
export async function changePlan(memberId, planCode, actor) {
  const sub = await liveSubscription(memberId);
  if (!sub) throw new NotFoundError('No active plan');
  if (sub.plan_code === planCode) return subView(sub);
  const { rows: plans } = await query(`SELECT * FROM billing_plans WHERE code = $1 AND active`, [planCode]);
  if (!plans[0]) throw new NotFoundError('Plan not found');
  const { rows } = await query(
    `UPDATE subscriptions SET plan_code = $2, price_cents = $3, consent_text = $4 WHERE id = $1 RETURNING *`,
    [sub.id, planCode, plans[0].price_cents, consentText({ planName: plans[0].name, priceCents: plans[0].price_cents })],
  );
  await query(`UPDATE members SET membership_tier = $2 WHERE id = $1`, [memberId, { steady: 1, focused: 2, express: 3 }[planCode] ?? 1]);
  await audit({ actorUserId: actor?.userId ?? null, actorRole: actor?.role ?? null, action: 'billing.plan_changed', entityType: 'subscription', entityId: sub.id, metadata: { from: sub.plan_code, to: planCode } });
  return subView({ ...rows[0], plan_name: plans[0].name, target_months: plans[0].target_months });
}

// ── 1:1 counseling sessions ($89 / 45 min, independent add-on) ──

async function pickCounselor(memberId) {
  const { rows: leads } = await query(
    `SELECT staff_or_partner_user AS user_id FROM team_assignments
      WHERE member_id = $1 AND assignee_kind = 'staff' AND deleted_at IS NULL ORDER BY assigned_at ASC LIMIT 1`,
    [memberId],
  );
  if (leads[0]) return leads[0].user_id;
  const { rows } = await query(
    `SELECT u.id FROM users u WHERE u.role IN ('specialist','manager','admin') AND u.deleted_at IS NULL AND u.status = 'active'
      ORDER BY u.role = 'specialist' DESC, u.created_at ASC LIMIT 1`,
  );
  return rows[0]?.id ?? null;
}

export async function bookSession(member, { type, scheduledAt, topic, topicCode, paymentMethodToken }, actor) {
  const when = new Date(scheduledAt);
  if (Number.isNaN(when.getTime()) || when <= new Date()) throw new ValidationError('Pick a future time');
  const settings = await sessionSettings();
  const sub = await liveSubscription(member.id);
  const processor = getPaymentAdapter();

  // Charge the card on file when the member has a plan; otherwise require a token.
  let customerId = sub?.processor_customer_id ?? null;
  let paymentMethodId = null;
  if (sub?.processor_subscription_id && !paymentMethodToken) {
    paymentMethodId = await defaultPaymentMethod(processor, sub);
  } else {
    if (!paymentMethodToken) throw new ValidationError('A payment method is required');
    if (!customerId) ({ customerId } = await processor.createCustomer({ email: member.email, name: member.name, memberId: member.id }));
    ({ paymentMethodId } = await processor.attachPaymentMethod({ customerId, paymentMethodToken }));
  }

  const counselorId = await pickCounselor(member.id);
  if (!counselorId) throw new ValidationError('No counselor is available right now. Message your team.');

  const description = `${settings.name}, ${settings.durationMin} min, ${when.toLocaleDateString('en-US')}`;
  const charge = await processor.charge({ customerId, paymentMethodId, amountCents: settings.priceCents, description, metadata: { memberId: member.id, kind: 'session' } });
  if (charge.status !== 'succeeded') {
    await query(
      `INSERT INTO payments (member_id, kind, amount_cents, status, description, processor, processor_ref, failure_reason)
       VALUES ($1,'session',$2,'failed',$3,$4,$5,$6)`,
      [member.id, settings.priceCents, description, processor.name, charge.chargeRef ?? null, charge.failureReason ?? 'declined'],
    );
    throw new ValidationError('Your card was declined. Try another card.', { code: 'card_declined' });
  }

  const session = await withTransaction(async (q) => {
    const { rows: pay } = await q(
      `INSERT INTO payments (member_id, subscription_id, kind, amount_cents, status, description, processor, processor_ref)
       VALUES ($1,$2,'session',$3,'succeeded',$4,$5,$6) RETURNING id`,
      [member.id, sub?.id ?? null, settings.priceCents, description, processor.name, charge.chargeRef],
    );
    const { rows: appt } = await q(
      `INSERT INTO appointments (member_id, participant_id, type, scheduled_at, is_consultation)
       VALUES ($1,$2,$3,$4,false) RETURNING id, scheduled_at, type, status`,
      [member.id, counselorId, type, when.toISOString()],
    );
    const { rows } = await q(
      `INSERT INTO counseling_sessions (member_id, appointment_id, payment_id, price_cents, duration_min, topic, topic_code, format)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'single') RETURNING *`,
      [member.id, appt[0].id, pay[0].id, settings.priceCents, settings.durationMin, topic ?? null, topicCode ?? null],
    );
    return { ...rows[0], scheduled_at: appt[0].scheduled_at, type: appt[0].type, appointment_status: appt[0].status };
  });

  await audit({
    actorUserId: actor?.userId ?? null, actorRole: actor?.role ?? null, action: 'billing.session_booked',
    entityType: 'counseling_session', entityId: session.id, metadata: { scheduledAt: when.toISOString(), priceCents: settings.priceCents },
    ip: actor?.reqMeta?.ip ?? null, userAgent: actor?.reqMeta?.userAgent ?? null,
  });
  sendReceipt(member.email, {
    subject: 'Your 1:1 counseling session is booked',
    lines: [
      `When: ${when.toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' })}`,
      `Format: ${type === 'in_person' ? 'In person' : type === 'video' ? 'Video' : 'Phone'}, ${settings.durationMin} minutes`,
      `Paid: ${money(settings.priceCents)}`,
      '', 'Need to move it? Cancel at least 24 hours ahead in the app for a full refund.',
    ],
  });
  return sessionView(session);
}

/**
 * One-off charge for a priced add-on (mail service, etc). Card or bank on file when the
 * member has a plan; otherwise a payment token is required. Records the payment row and
 * returns it. Throws ValidationError('card_declined') on failure after recording it.
 */
export async function chargeOnce(member, { kind, amountCents, description, paymentMethodToken, metadata }, db = query) {
  const sub = await liveSubscription(member.id);
  const processor = getPaymentAdapter();
  let customerId = sub?.processor_customer_id ?? null;
  let paymentMethodId = null;
  if (sub?.processor_subscription_id && !paymentMethodToken) {
    paymentMethodId = await defaultPaymentMethod(processor, sub);
  } else {
    if (!paymentMethodToken) throw new ValidationError('A payment method is required', { code: 'payment_method_required' });
    if (!customerId) ({ customerId } = await processor.createCustomer({ email: member.email, name: member.name, memberId: member.id }));
    ({ paymentMethodId } = await processor.attachPaymentMethod({ customerId, paymentMethodToken }));
  }
  const charge = await processor.charge({ customerId, paymentMethodId, amountCents, description, metadata: { memberId: member.id, kind, ...(metadata ?? {}) } });
  const ok = charge.status === 'succeeded';
  const { rows } = await db(
    `INSERT INTO payments (member_id, subscription_id, kind, amount_cents, status, description, processor, processor_ref, failure_reason)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id, amount_cents, status`,
    [member.id, sub?.id ?? null, kind, amountCents, ok ? 'succeeded' : 'failed', description, processor.name, charge.chargeRef ?? null, ok ? null : (charge.failureReason ?? 'declined')],
  );
  if (!ok) throw new ValidationError('Your payment was declined. Try another card.', { code: 'card_declined' });
  return rows[0];
}

async function defaultPaymentMethod(processor, sub) {
  // Stripe charges the customer's default method when payment_method is omitted; the
  // mock needs an id but never declines a stored method. Keep the seam explicit.
  if (processor.name === 'stripe') return undefined;
  return `pm_stored_${sub.id.slice(0, 8)}`;
}

/** Member cancels a session. Full refund if 24h+ ahead; otherwise no refund. */
export async function cancelSession(memberId, sessionId, actor) {
  const { rows } = await query(
    `SELECT cs.*, a.scheduled_at, p.processor, p.processor_ref, p.status AS pay_status
       FROM counseling_sessions cs JOIN appointments a ON a.id = cs.appointment_id
       LEFT JOIN payments p ON p.id = cs.payment_id
      WHERE cs.id = $1 AND cs.member_id = $2`,
    [sessionId, memberId],
  );
  const s = rows[0];
  if (!s) throw new NotFoundError('Session not found');
  if (s.status !== 'booked') throw new ConflictError('Session is not open');
  const hoursAhead = (new Date(s.scheduled_at) - Date.now()) / 36e5;
  const refundable = hoursAhead >= 24 && s.pay_status === 'succeeded' && s.processor_ref;

  if (refundable) {
    await getPaymentAdapter().refund({ chargeRef: s.processor_ref, amountCents: s.price_cents });
    await query(`UPDATE payments SET status = 'refunded' WHERE id = $1`, [s.payment_id]);
  }
  await query(`UPDATE appointments SET status = 'cancelled' WHERE id = $1`, [s.appointment_id]);
  const { rows: upd } = await query(
    `UPDATE counseling_sessions SET status = $2 WHERE id = $1 RETURNING *`,
    [sessionId, refundable ? 'refunded' : 'cancelled'],
  );
  await audit({ actorUserId: actor?.userId ?? null, actorRole: actor?.role ?? null, action: 'billing.session_cancelled', entityType: 'counseling_session', entityId: sessionId, metadata: { refunded: refundable, hoursAhead: Math.round(hoursAhead) } });
  return { ...sessionView({ ...upd[0], scheduled_at: s.scheduled_at }), refunded: Boolean(refundable) };
}

/** Session slots: weekday 45-minute blocks over the next two weeks, Raleigh time. */
export function sessionSlots(now = new Date(), count = 12) {
  return weekdaySlots(now, [{ h: 9, m: 0 }, { h: 11, m: 0 }, { h: 13, m: 30 }, { h: 15, m: 30 }, { h: 17, m: 30 }], count);
}

// ── Processor webhooks (renewals, failures, cancellations) ──

export async function handleWebhook(event) {
  const processor = getPaymentAdapter().name;
  const { rows } = await query(
    `INSERT INTO billing_events (processor, event_id, event_type, payload) VALUES ($1,$2,$3,$4)
     ON CONFLICT (processor, event_id) DO NOTHING RETURNING id`,
    [processor, event.id, event.type, JSON.stringify(event)],
  );
  if (!rows[0]) return { duplicate: true };
  const obj = event.data?.object ?? {};
  const subId = obj.subscription ?? obj.id;

  if (event.type === 'invoice.paid' && obj.subscription) {
    const { rows: subs } = await query(`SELECT * FROM subscriptions WHERE processor_subscription_id = $1`, [obj.subscription]);
    const sub = subs[0];
    if (sub) {
      const line = obj.lines?.data?.[0]?.period;
      const start = line ? new Date(line.start * 1000) : new Date();
      const end = line ? new Date(line.end * 1000) : new Date(Date.now() + 30 * 864e5);
      await query(`UPDATE subscriptions SET status = 'active', current_period_start = $2, current_period_end = $3 WHERE id = $1`, [sub.id, start, end]);
      await query(
        `INSERT INTO payments (member_id, subscription_id, kind, amount_cents, status, description, processor, processor_ref)
         VALUES ($1,$2,'subscription',$3,'succeeded',$4,$5,$6) ON CONFLICT (processor, processor_ref) WHERE processor_ref IS NOT NULL DO NOTHING`,
        [sub.member_id, sub.id, obj.amount_paid ?? sub.price_cents, 'Plan renewal', processor, obj.id],
      );
      onSubscriptionPayment(sub.member_id);
    }
  } else if (event.type === 'invoice.payment_failed' && obj.subscription) {
    const { rows: subs } = await query(`SELECT * FROM subscriptions WHERE processor_subscription_id = $1`, [obj.subscription]);
    const sub = subs[0];
    if (sub) {
      await query(`UPDATE subscriptions SET status = 'past_due' WHERE id = $1`, [sub.id]);
      await query(
        `INSERT INTO payments (member_id, subscription_id, kind, amount_cents, status, description, processor, processor_ref, failure_reason)
         VALUES ($1,$2,'subscription',$3,'failed','Plan renewal',$4,$5,$6) ON CONFLICT (processor, processor_ref) WHERE processor_ref IS NOT NULL DO NOTHING`,
        [sub.member_id, sub.id, obj.amount_due ?? sub.price_cents, processor, obj.id, 'payment_failed'],
      );
      const { rows: u } = await query(`SELECT u.email FROM members m JOIN users u ON u.id = m.user_id WHERE m.id = $1`, [sub.member_id]);
      if (u[0]) sendReceipt(u[0].email, { subject: 'Action needed: your plan payment did not go through', lines: ['We could not charge your card for this month. Update your payment method in Billing to keep your plan active.'] });
    }
  } else if (event.type === 'customer.subscription.deleted') {
    await query(`UPDATE subscriptions SET status = 'cancelled', cancelled_at = COALESCE(cancelled_at, now()) WHERE processor_subscription_id = $1`, [subId]);
  }
  await query(`UPDATE billing_events SET processed_at = now() WHERE processor = $1 AND event_id = $2`, [processor, event.id]);
  return { ok: true };
}

/** Nightly: expire subscriptions whose paid period ended after a cancel request. */
export async function expireCancelled() {
  const { rowCount } = await query(
    `UPDATE subscriptions SET status = 'cancelled'
      WHERE cancel_at_period_end AND status <> 'cancelled' AND current_period_end < now() AND deleted_at IS NULL`,
  );
  return rowCount;
}

// ── Operator views ──

export async function operatorSummary() {
  const [{ rows: subs }, { rows: rev }, { rows: sessions }, { rows: recent }] = await Promise.all([
    query(
      `SELECT p.code, p.name, p.price_cents,
              COUNT(s.id) FILTER (WHERE s.status = 'active' AND NOT s.cancel_at_period_end)::int AS active,
              COUNT(s.id) FILTER (WHERE s.cancel_at_period_end AND s.status <> 'cancelled')::int AS cancelling,
              COUNT(s.id) FILTER (WHERE s.status = 'past_due')::int AS past_due
         FROM billing_plans p LEFT JOIN subscriptions s ON s.plan_code = p.code AND s.deleted_at IS NULL
        WHERE p.active GROUP BY p.code, p.name, p.price_cents, p.sort_order ORDER BY p.sort_order`,
    ),
    query(
      `SELECT COALESCE(SUM(amount_cents) FILTER (WHERE status = 'succeeded' AND created_at >= date_trunc('month', now())),0)::int AS month_cents,
              COALESCE(SUM(amount_cents) FILTER (WHERE status = 'succeeded'),0)::int AS lifetime_cents,
              COALESCE(SUM(amount_cents) FILTER (WHERE status = 'refunded'),0)::int AS refunded_cents,
              COUNT(*) FILTER (WHERE status = 'failed' AND created_at >= now() - interval '30 days')::int AS failed_30d
         FROM payments`,
    ),
    query(
      `SELECT COUNT(*) FILTER (WHERE a.scheduled_at >= now() AND cs.status = 'booked')::int AS upcoming,
              COUNT(*) FILTER (WHERE cs.status = 'completed' AND cs.created_at >= date_trunc('month', now()))::int AS completed_month
         FROM counseling_sessions cs JOIN appointments a ON a.id = cs.appointment_id`,
    ),
    query(
      `SELECT p.id, p.kind, p.amount_cents, p.status, p.description, p.created_at, u.email
         FROM payments p JOIN members m ON m.id = p.member_id JOIN users u ON u.id = m.user_id
        ORDER BY p.created_at DESC LIMIT 25`,
    ),
  ]);
  const mrrCents = subs.reduce((acc, r) => acc + r.price_cents * r.active, 0);
  return {
    plans: subs.map((r) => ({ code: r.code, name: r.name, priceCents: r.price_cents, active: r.active, cancelling: r.cancelling, pastDue: r.past_due })),
    mrrCents,
    revenue: { monthCents: rev[0].month_cents, lifetimeCents: rev[0].lifetime_cents, refundedCents: rev[0].refunded_cents, failed30d: rev[0].failed_30d },
    sessions: { upcoming: sessions[0].upcoming, completedThisMonth: sessions[0].completed_month },
    recent: recent.map((p) => ({ id: p.id, email: p.email, kind: p.kind, amountCents: p.amount_cents, status: p.status, description: p.description, createdAt: p.created_at })),
    processor: getPaymentAdapter().name,
  };
}

export async function memberBilling(memberId) {
  return overview(memberId);
}

/** Staff marks a session completed (or no-show) after the meeting. */
export async function completeSession(sessionId, { status }, actor) {
  if (!['completed', 'cancelled'].includes(status)) throw new ValidationError('status must be completed or cancelled');
  const { rows } = await query(`UPDATE counseling_sessions SET status = $2 WHERE id = $1 AND status = 'booked' RETURNING *`, [sessionId, status]);
  if (!rows[0]) throw new NotFoundError('Open session not found');
  await query(`UPDATE appointments SET status = $2 WHERE id = $1`, [rows[0].appointment_id, status === 'completed' ? 'completed' : 'no_show']);
  await audit({ actorUserId: actor.userId, actorRole: actor.role, action: 'billing.session_marked', entityType: 'counseling_session', entityId: sessionId, metadata: { status } });
  return sessionView(rows[0]);
}

function sendReceipt(to, { subject, lines }) {
  if (env.isTest || !env.mail.host) return;
  sendMail({ to, subject, text: `${lines.join('\n')}\n\nCHASE HomePath\nsupport@chasehomepath.com` }).catch(() => {});
}

// ── Topics, group sessions, meeting rooms ──

export async function listTopics() {
  const { rows } = await query(`SELECT code, name, blurb FROM counseling_topics WHERE active ORDER BY sort_order`);
  return rows;
}

export async function groupSettings() {
  const { rows } = await query(`SELECT value FROM billing_settings WHERE key = 'group_session'`);
  return rows[0]?.value ?? { priceCents: 4900, durationMin: 60, name: 'Group counseling session', placeholder: true };
}

/** Upcoming group sessions with seats left (member view). */
export async function listGroupSessions(memberId) {
  const { rows } = await query(
    `SELECT g.*, t.name AS topic_name, u.email AS host_email,
            (SELECT COUNT(*)::int FROM counseling_sessions cs WHERE cs.group_session_id = g.id AND cs.status IN ('booked','completed')) AS seats_taken,
            EXISTS (SELECT 1 FROM counseling_sessions cs WHERE cs.group_session_id = g.id AND cs.member_id = $1 AND cs.status IN ('booked','completed')) AS joined
       FROM group_sessions g JOIN counseling_topics t ON t.code = g.topic_code JOIN users u ON u.id = g.host_user_id
      WHERE g.status = 'scheduled' AND g.scheduled_at > now()
      ORDER BY g.scheduled_at LIMIT 30`,
    [memberId ?? null],
  );
  return rows.map(groupView);
}

function groupView(g) {
  return {
    id: g.id, topicCode: g.topic_code, topicName: g.topic_name, title: g.title, scheduledAt: g.scheduled_at,
    durationMin: g.duration_min, capacity: g.capacity, seatsTaken: g.seats_taken ?? 0,
    seatsLeft: Math.max(0, g.capacity - (g.seats_taken ?? 0)), priceCents: g.price_cents, status: g.status,
    joined: Boolean(g.joined), roomCode: g.room_code, host: g.host_email ? g.host_email.split('@')[0] : null,
  };
}

/** Staff schedules a group class. */
export async function createGroupSession(actor, { topicCode, title, scheduledAt, durationMin, capacity, priceCents }) {
  const when = new Date(scheduledAt);
  if (Number.isNaN(when.getTime()) || when <= new Date()) throw new ValidationError('Pick a future time');
  const settings = await groupSettings();
  const { rows: topic } = await query(`SELECT name FROM counseling_topics WHERE code = $1 AND active`, [topicCode]);
  if (!topic[0]) throw new NotFoundError('Topic not found');
  const { rows } = await query(
    `INSERT INTO group_sessions (topic_code, title, host_user_id, scheduled_at, duration_min, capacity, price_cents)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [topicCode, title || topic[0].name, actor.userId, when.toISOString(), durationMin ?? settings.durationMin, capacity ?? 12, priceCents ?? settings.priceCents],
  );
  await audit({ actorUserId: actor.userId, actorRole: actor.role, action: 'billing.group_session_created', entityType: 'group_session', entityId: rows[0].id, metadata: { topicCode, scheduledAt: when.toISOString() } });
  return groupView({ ...rows[0], topic_name: topic[0].name });
}

/** Member buys a seat in a group session (video only). */
export async function joinGroupSession(member, groupId, { paymentMethodToken }, actor) {
  const { rows } = await query(
    `SELECT g.*, t.name AS topic_name,
            (SELECT COUNT(*)::int FROM counseling_sessions cs WHERE cs.group_session_id = g.id AND cs.status IN ('booked','completed')) AS seats_taken
       FROM group_sessions g JOIN counseling_topics t ON t.code = g.topic_code WHERE g.id = $1`,
    [groupId],
  );
  const g = rows[0];
  if (!g || g.status !== 'scheduled') throw new NotFoundError('Group session not found');
  if (new Date(g.scheduled_at) <= new Date()) throw new ConflictError('This session has already started');
  if (g.seats_taken >= g.capacity) throw new ConflictError('This session is full', 'session_full');
  const { rows: dup } = await query(`SELECT 1 FROM counseling_sessions WHERE group_session_id = $1 AND member_id = $2 AND status IN ('booked','completed')`, [groupId, member.id]);
  if (dup[0]) throw new ConflictError('You already have a seat', 'already_joined');

  const processor = getPaymentAdapter();
  const sub = await liveSubscription(member.id);
  let customerId = sub?.processor_customer_id ?? null;
  let paymentMethodId = null;
  if (sub?.processor_subscription_id && !paymentMethodToken) {
    paymentMethodId = await defaultPaymentMethod(processor, sub);
  } else {
    if (!paymentMethodToken) throw new ValidationError('A payment method is required');
    if (!customerId) ({ customerId } = await processor.createCustomer({ email: member.email, name: member.name, memberId: member.id }));
    ({ paymentMethodId } = await processor.attachPaymentMethod({ customerId, paymentMethodToken }));
  }
  const description = `Group session: ${g.title}, ${new Date(g.scheduled_at).toLocaleDateString('en-US')}`;
  const charge = await processor.charge({ customerId, paymentMethodId, amountCents: g.price_cents, description, metadata: { memberId: member.id, kind: 'group' } });
  if (charge.status !== 'succeeded') {
    await query(
      `INSERT INTO payments (member_id, kind, amount_cents, status, description, processor, processor_ref, failure_reason)
       VALUES ($1,'session',$2,'failed',$3,$4,$5,$6)`,
      [member.id, g.price_cents, description, processor.name, charge.chargeRef ?? null, charge.failureReason ?? 'declined'],
    );
    throw new ValidationError('Your card was declined. Try another card.', { code: 'card_declined' });
  }
  const session = await withTransaction(async (q) => {
    const { rows: pay } = await q(
      `INSERT INTO payments (member_id, subscription_id, kind, amount_cents, status, description, processor, processor_ref)
       VALUES ($1,$2,'session',$3,'succeeded',$4,$5,$6) RETURNING id`,
      [member.id, sub?.id ?? null, g.price_cents, description, processor.name, charge.chargeRef],
    );
    const { rows: appt } = await q(
      `INSERT INTO appointments (member_id, participant_id, type, scheduled_at, is_consultation) VALUES ($1,$2,'video',$3,false) RETURNING id, scheduled_at, type`,
      [member.id, g.host_user_id, g.scheduled_at],
    );
    const { rows: cs } = await q(
      `INSERT INTO counseling_sessions (member_id, appointment_id, payment_id, price_cents, duration_min, topic, topic_code, format, group_session_id, room_code)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'group',$8,$9) RETURNING *`,
      [member.id, appt[0].id, pay[0].id, g.price_cents, g.duration_min, g.title, g.topic_code, g.id, g.room_code],
    );
    return { ...cs[0], scheduled_at: appt[0].scheduled_at, type: 'video', group_title: g.title };
  });
  await audit({ actorUserId: actor?.userId ?? null, actorRole: actor?.role ?? null, action: 'billing.group_seat_booked', entityType: 'counseling_session', entityId: session.id, metadata: { groupId, priceCents: g.price_cents } });
  return sessionView(session);
}

/**
 * Resolve a meeting room for the caller. Members: their own booked session.
 * Staff: sessions where they are the appointment participant / group host.
 */
export async function roomAccess(user, roomCode) {
  const { rows } = await query(
    `SELECT cs.room_code, cs.format, cs.duration_min, cs.status, a.scheduled_at, a.participant_id, m.user_id AS member_user_id,
            g.title AS group_title, g.host_user_id
       FROM counseling_sessions cs
       JOIN appointments a ON a.id = cs.appointment_id
       JOIN members m ON m.id = cs.member_id
       LEFT JOIN group_sessions g ON g.id = cs.group_session_id
      WHERE cs.room_code = $1 AND cs.status = 'booked'
      UNION ALL
     SELECT g.room_code, 'group', g.duration_min, g.status, g.scheduled_at, g.host_user_id, NULL, g.title, g.host_user_id
       FROM group_sessions g WHERE g.room_code = $1 AND g.status = 'scheduled'
      UNION ALL
     SELECT a.room_code, 'single', 45, a.status, a.scheduled_at, a.participant_id, m.user_id,
            CASE WHEN a.is_consultation THEN 'First consultation' ELSE 'Appointment' END, a.participant_id
       FROM appointments a JOIN members m ON m.id = a.member_id
      WHERE a.room_code = $1 AND a.status = 'scheduled' AND a.deleted_at IS NULL`,
    [roomCode],
  );
  if (!rows[0]) throw new NotFoundError('Room not found');
  const isStaff = ['specialist', 'manager', 'admin'].includes(user.role);
  const allowed = rows.some((r) => r.member_user_id === user.id || r.participant_id === user.id || r.host_user_id === user.id) || (isStaff && user.role !== 'specialist');
  if (!allowed) throw new ForbiddenError('Not your session');
  const r = rows[0];
  const opensAt = new Date(new Date(r.scheduled_at).getTime() - 10 * 60e3);
  const closesAt = new Date(new Date(r.scheduled_at).getTime() + (r.duration_min + 30) * 60e3);
  return {
    roomCode, format: r.format, title: r.group_title ?? '1:1 counseling session', scheduledAt: r.scheduled_at,
    durationMin: r.duration_min, opensAt, closesAt, open: Date.now() >= opensAt && Date.now() <= closesAt,
    role: isStaff ? 'host' : 'guest',
  };
}
