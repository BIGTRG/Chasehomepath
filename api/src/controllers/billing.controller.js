import { z } from 'zod';
import { requireMemberByUserId } from '../services/member.service.js';
import * as billing from '../services/billing.service.js';
import { getPaymentAdapter } from '../integrations/payments/index.js';

const actorFrom = (req) => ({
  userId: req.user.id,
  role: req.user.role,
  reqMeta: { ip: req.ip ?? null, userAgent: req.get('user-agent') ?? null },
});

const memberWithContact = async (req) => {
  const m = await requireMemberByUserId(req.user.id);
  return { ...m, email: req.user.email, name: req.user.name ?? null };
};

/** GET /api/billing/plans — public catalog + consent text per plan. */
export async function plans(_req, res) {
  const data = await billing.listPlans();
  res.json({
    ...data,
    plans: data.plans.map((p) => ({ ...p, consentText: billing.consentText({ planName: p.name, priceCents: p.priceCents }) })),
  });
}

export async function mine(req, res) {
  const member = await requireMemberByUserId(req.user.id);
  res.json(await billing.overview(member.id));
}

const subscribeSchema = z.object({
  planCode: z.string().min(1),
  paymentMethodToken: z.string().min(1),
  consentAccepted: z.literal(true),
});
export async function subscribe(req, res) {
  const body = subscribeSchema.parse(req.body);
  const member = await memberWithContact(req);
  res.status(201).json({ subscription: await billing.subscribe(member, body, actorFrom(req)) });
}

export async function cancel(req, res) {
  const member = await requireMemberByUserId(req.user.id);
  res.json({ subscription: await billing.cancel(member.id, actorFrom(req)) });
}

export async function resume(req, res) {
  const member = await requireMemberByUserId(req.user.id);
  res.json({ subscription: await billing.resume(member.id, actorFrom(req)) });
}

const changeSchema = z.object({ planCode: z.string().min(1) });
export async function changePlan(req, res) {
  const { planCode } = changeSchema.parse(req.body);
  const member = await requireMemberByUserId(req.user.id);
  res.json({ subscription: await billing.changePlan(member.id, planCode, actorFrom(req)) });
}

export async function sessionSlots(_req, res) {
  res.json({ slots: billing.sessionSlots(), session: await billing.sessionSettings(), topics: await billing.listTopics() });
}

/** GET /api/billing/counseling — public: topics, prices, upcoming group sessions (marketing + booking). */
export async function counseling(req, res) {
  let memberId = null;
  if (req.user?.role === 'member') memberId = (await requireMemberByUserId(req.user.id)).id;
  res.json({
    topics: await billing.listTopics(),
    single: await billing.sessionSettings(),
    group: await billing.groupSettings(),
    groupSessions: await billing.listGroupSessions(memberId),
  });
}

const joinSchema = z.object({ paymentMethodToken: z.string().min(1).optional() });
export async function joinGroup(req, res) {
  const body = joinSchema.parse(req.body);
  const member = await memberWithContact(req);
  res.status(201).json({ session: await billing.joinGroupSession(member, req.params.id, body, actorFrom(req)) });
}

const groupSchema = z.object({
  topicCode: z.string().min(1),
  title: z.string().trim().max(120).optional(),
  scheduledAt: z.string().min(1),
  durationMin: z.number().int().min(15).max(240).optional(),
  capacity: z.number().int().min(2).max(200).optional(),
  priceCents: z.number().int().min(0).optional(),
});
export async function createGroup(req, res) {
  const body = groupSchema.parse(req.body);
  res.status(201).json({ groupSession: await billing.createGroupSession(actorFrom(req), body) });
}

const bookSchema = z.object({
  type: z.enum(['in_person', 'video', 'call']),
  scheduledAt: z.string().min(1),
  topic: z.string().trim().max(300).optional(),
  topicCode: z.string().max(40).optional(),
  paymentMethodToken: z.string().min(1).optional(),
});
export async function bookSession(req, res) {
  const body = bookSchema.parse(req.body);
  const member = await memberWithContact(req);
  res.status(201).json({ session: await billing.bookSession(member, body, actorFrom(req)) });
}

export async function cancelSession(req, res) {
  const member = await requireMemberByUserId(req.user.id);
  res.json({ session: await billing.cancelSession(member.id, req.params.id, actorFrom(req)) });
}

/** POST /api/billing/webhook — processor events. Raw body, signature-verified. */
export async function webhook(req, res) {
  const event = getPaymentAdapter().verifyWebhook(req.body, req.get('stripe-signature'));
  res.json(await billing.handleWebhook(event));
}

// ── Operator ──
export async function summary(_req, res) {
  res.json(await billing.operatorSummary());
}
export async function memberBilling(req, res) {
  res.json(await billing.memberBilling(req.params.memberId));
}
const markSchema = z.object({ status: z.enum(['completed', 'cancelled']) });
export async function markSession(req, res) {
  const body = markSchema.parse(req.body);
  res.json({ session: await billing.completeSession(req.params.id, body, actorFrom(req)) });
}
