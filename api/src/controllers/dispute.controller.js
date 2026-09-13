import { z } from 'zod';
import { requireMemberByUserId } from '../services/member.service.js';
import * as disputes from '../services/dispute.service.js';

const actorFrom = (req) => ({ userId: req.user.id, role: req.user.role, reqMeta: { ip: req.ip ?? null, userAgent: req.get('user-agent') ?? null } });
const opt = (s) => s.optional().nullable();

export async function options(req, res) {
  const member = await requireMemberByUserId(req.user.id);
  res.json({ reasons: disputes.REASON_LIST, bureaus: disputes.BUREAU_LIST, letterhead: await disputes.getLetterhead(member), mailService: await disputes.mailServiceSettings(), proofKinds: disputes.PROOF_KINDS });
}

const letterheadSchema = z.object({ line1: z.string().min(3).max(120), line2: opt(z.string().max(120)), city: z.string().min(2).max(80), state: z.string().length(2), zip: z.string().max(10), dateOfBirth: opt(z.string().max(10)) });
export async function setLetterhead(req, res) {
  const member = await requireMemberByUserId(req.user.id);
  res.json({ letterhead: await disputes.setLetterhead(member, letterheadSchema.parse(req.body ?? {}), actorFrom(req)) });
}

const startSchema = z.object({ reasonCode: z.string().max(40), details: opt(z.string().max(1500)), bureaus: z.array(z.string()).max(3).optional() });
export async function start(req, res) {
  const body = startSchema.parse(req.body ?? {});
  const member = await requireMemberByUserId(req.user.id);
  res.status(201).json(await disputes.startDispute(member, req.params.id, { ...body, initiatedByUserId: req.user.id }, actorFrom(req)));
}

export async function list(req, res) {
  const member = await requireMemberByUserId(req.user.id);
  res.json({ cases: await disputes.listCases(member) });
}

export async function get(req, res) {
  const member = await requireMemberByUserId(req.user.id);
  res.json(await disputes.getDispute(member, req.params.id));
}

export async function getByLetter(req, res) {
  const member = await requireMemberByUserId(req.user.id);
  res.json(await disputes.getCaseByLetter(member, req.params.letterId));
}

export async function editLetter(req, res) {
  const member = await requireMemberByUserId(req.user.id);
  res.json(await disputes.editLetter(member, req.params.letterId, z.object({ body: z.string() }).parse(req.body ?? {}), actorFrom(req)));
}

export async function approveLetter(req, res) {
  const member = await requireMemberByUserId(req.user.id);
  res.json(await disputes.approveLetter(member, req.params.letterId, z.object({ signedName: z.string().max(120) }).parse(req.body ?? {}), actorFrom(req)));
}

const sentSchema = z.object({ method: z.string(), sentOn: opt(z.string().max(10)), tracking: opt(z.string().max(60)) });
export async function markSent(req, res) {
  const member = await requireMemberByUserId(req.user.id);
  res.json(await disputes.markSent(member, req.params.letterId, sentSchema.parse(req.body ?? {}), actorFrom(req)));
}

export async function outcome(req, res) {
  const member = await requireMemberByUserId(req.user.id);
  res.json(await disputes.recordOutcome(member, req.params.id, z.object({ outcome: z.string(), note: opt(z.string().max(1000)) }).parse(req.body ?? {}), actorFrom(req)));
}

const nextSchema = z.object({ kind: z.string(), bureaus: z.array(z.string()).max(3).optional(), recipientAddress: opt(z.string().max(400)) });
export async function nextRound(req, res) {
  const member = await requireMemberByUserId(req.user.id);
  res.status(201).json(await disputes.nextRound(member, req.params.id, nextSchema.parse(req.body ?? {}), actorFrom(req)));
}

// ── Mail it for me, and proof of mailing ──
export async function mailQuote(req, res) {
  const member = await requireMemberByUserId(req.user.id);
  res.json(await disputes.mailQuote(member, req.params.letterId));
}

const mailSchema = z.object({ paymentMethodToken: opt(z.string().max(200)), consentAccepted: z.boolean() });
export async function mailLetter(req, res) {
  const member = await requireMemberByUserId(req.user.id);
  res.json(await disputes.mailLetter(member, req.params.letterId, mailSchema.parse(req.body ?? {}), actorFrom(req)));
}

const proofSchema = z.object({ kind: z.string().max(30), fileName: opt(z.string().max(200)), mimeType: z.string().max(80), dataBase64: z.string().min(8) });
export async function attachProof(req, res) {
  const member = await requireMemberByUserId(req.user.id);
  res.status(201).json(await disputes.attachProof(member, req.params.letterId, proofSchema.parse(req.body ?? {}), actorFrom(req)));
}

/** POST /api/credit/mail-webhook — mail provider events. Raw body, provider-verified. */
export async function mailWebhook(req, res) {
  const { getMailAdapter } = await import('../integrations/mail/index.js');
  const ev = getMailAdapter().verifyWebhook(req.body, req.get('lob-signature'), req.get('lob-signature-timestamp'));
  res.json(await disputes.applyMailStatus(ev));
}

// ── Operator: the switch ──
export async function getMailService(_req, res) { res.json(await disputes.mailServiceSettings()); }
export async function setMailService(req, res) {
  res.json(await disputes.setMailService(z.object({ enabled: z.boolean() }).parse(req.body ?? {}), actorFrom(req)));
}
