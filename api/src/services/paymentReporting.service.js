import { query } from '../db/pool.js';
import { audit } from '../lib/audit.js';
import { NotFoundError } from '../lib/errors.js';
import { getPaymentReportingAdapter } from '../integrations/paymentReporting/index.js';

/**
 * Payment reporting: with the member's opt-in, each successful monthly plan payment
 * is queued as a reportable event (amount, period, due date, paid date, on-time flag)
 * and pushed through the furnisher adapter. Without opt-in, nothing is queued.
 * FCRA note: furnished data must be accurate and disputable; the events table is the
 * audit trail for both.
 */
export const REPORTING_CONSENT =
  'I ask CHASE HomePath to report my monthly plan payments, including on-time and late status, ' +
  'to the payment-reporting service it uses, so my payment history can be considered as part of my ' +
  'credit profile. I understand reporting does not guarantee any score change, that late or missed ' +
  'payments may also be reported, and that I can stop future reporting any time in Billing.';

export async function status(memberId) {
  const { rows } = await query(`SELECT payment_reporting_opt_in_at FROM members WHERE id = $1`, [memberId]);
  const { rows: ev } = await query(
    `SELECT id, period_start, period_end, amount_cents, paid_on, due_on, on_time, status, created_at
       FROM payment_reporting_events WHERE member_id = $1 ORDER BY paid_on DESC LIMIT 24`,
    [memberId],
  );
  return {
    optedIn: Boolean(rows[0]?.payment_reporting_opt_in_at),
    optedInAt: rows[0]?.payment_reporting_opt_in_at ?? null,
    consentText: REPORTING_CONSENT,
    events: ev.map((e) => ({ id: e.id, periodStart: e.period_start, periodEnd: e.period_end, amountCents: e.amount_cents, paidOn: e.paid_on, dueOn: e.due_on, onTime: e.on_time, status: e.status })),
  };
}

export async function setOptIn(memberId, optIn, actor) {
  await query(
    optIn
      ? `UPDATE members SET payment_reporting_opt_in_at = now(), payment_reporting_consent_text = $2 WHERE id = $1`
      : `UPDATE members SET payment_reporting_opt_in_at = NULL WHERE id = $1`,
    optIn ? [memberId, REPORTING_CONSENT] : [memberId],
  );
  await audit({ actorUserId: actor?.userId ?? null, actorRole: actor?.role ?? null, action: optIn ? 'reporting.opted_in' : 'reporting.opted_out', entityType: 'member', entityId: memberId, ip: actor?.reqMeta?.ip ?? null, userAgent: actor?.reqMeta?.userAgent ?? null });
  if (optIn) await backfill(memberId);
  return status(memberId);
}

/** Queue any successful subscription payments not yet queued (called on opt-in and on each payment). */
export async function backfill(memberId) {
  const { rows } = await query(
    `SELECT p.id, p.amount_cents, p.created_at, s.current_period_start, s.current_period_end
       FROM payments p JOIN subscriptions s ON s.id = p.subscription_id
      WHERE p.member_id = $1 AND p.kind = 'subscription' AND p.status = 'succeeded'
        AND NOT EXISTS (SELECT 1 FROM payment_reporting_events e WHERE e.payment_id = p.id)
        AND (SELECT payment_reporting_opt_in_at FROM members WHERE id = $1) IS NOT NULL`,
    [memberId],
  );
  for (const p of rows) await queueEvent(memberId, p);
  return rows.length;
}

async function queueEvent(memberId, p) {
  const paidOn = new Date(p.created_at);
  const dueOn = new Date(p.current_period_start);
  const onTime = paidOn.getTime() - dueOn.getTime() <= 30 * 864e5;
  const { rows } = await query(
    `INSERT INTO payment_reporting_events (member_id, payment_id, period_start, period_end, amount_cents, paid_on, due_on, on_time)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (payment_id) DO NOTHING RETURNING *`,
    [memberId, p.id, p.current_period_start, p.current_period_end, p.amount_cents, paidOn, dueOn, onTime],
  );
  if (rows[0]) await dispatch(rows[0]);
}

/** Called after a successful subscription payment; no-op unless opted in. */
export async function onSubscriptionPayment(memberId) {
  try { await backfill(memberId); } catch { /* reporting must never break billing */ }
}

async function dispatch(event) {
  const adapter = getPaymentReportingAdapter();
  try {
    const r = await adapter.report({ event });
    await query(`UPDATE payment_reporting_events SET status = $2, adapter = $3, external_ref = $4 WHERE id = $1`, [event.id, r.status, adapter.name, r.externalRef]);
  } catch (err) {
    await query(`UPDATE payment_reporting_events SET status = 'failed', adapter = $2, error = $3 WHERE id = $1`, [event.id, adapter.name, String(err.message).slice(0, 500)]);
  }
}

export async function operatorSummary() {
  const { rows } = await query(
    `SELECT COUNT(DISTINCT m.id) FILTER (WHERE m.payment_reporting_opt_in_at IS NOT NULL)::int AS opted_in,
            COUNT(e.id)::int AS events,
            COUNT(e.id) FILTER (WHERE e.status IN ('sent','acknowledged'))::int AS reported,
            COUNT(e.id) FILTER (WHERE e.status = 'failed')::int AS failed,
            COUNT(e.id) FILTER (WHERE e.on_time)::int AS on_time
       FROM members m LEFT JOIN payment_reporting_events e ON e.member_id = m.id WHERE m.deleted_at IS NULL`,
  );
  if (!rows[0]) throw new NotFoundError();
  return { optedIn: rows[0].opted_in, events: rows[0].events, reported: rows[0].reported, failed: rows[0].failed, onTime: rows[0].on_time };
}
