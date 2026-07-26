import { z } from 'zod';
import { requireMemberByUserId } from '../services/member.service.js';
import * as credit from '../services/credit.service.js';

const actorFrom = (req) => ({
  userId: req.user.id,
  role: req.user.role,
  reqMeta: { ip: req.ip ?? null, userAgent: req.get('user-agent') ?? null },
});

/** POST /api/credit/pull — member authorizes a report pull (fee disclosure lives in the UI). */
export async function pull(req, res) {
  const member = await requireMemberByUserId(req.user.id);
  const result = await credit.ingestReport(member, actorFrom(req));
  res.status(201).json(result);
}

/** GET /api/credit — disputable vs accurate split; score withheld until first meeting. */
export async function overview(req, res) {
  const member = await requireMemberByUserId(req.user.id);
  res.json(await credit.getCreditOverview(member));
}

/** GET /api/credit/items/:id — finding + FCRA rights; nothing pre-selected. */
export async function itemDetail(req, res) {
  const member = await requireMemberByUserId(req.user.id);
  res.json(await credit.getItemDetail(member, req.params.id));
}

const disputeSchema = z.object({ method: z.enum(['online', 'mail', 'phone']).optional() });

/** POST /api/credit/items/:id/dispute — member-initiated only; initiator recorded. */
export async function fileDispute(req, res) {
  const { method } = disputeSchema.parse(req.body ?? {});
  const member = await requireMemberByUserId(req.user.id);
  const dispute = await credit.fileDispute(
    member,
    req.params.id,
    { method, initiatedByUserId: req.user.id },
    actorFrom(req),
  );
  res.status(201).json({ dispute });
}

export async function withdrawDispute(req, res) {
  const member = await requireMemberByUserId(req.user.id);
  res.json({ dispute: await credit.withdrawDispute(member, req.params.id, actorFrom(req)) });
}

export async function listDisputes(req, res) {
  const member = await requireMemberByUserId(req.user.id);
  res.json({ disputes: await credit.listDisputes(member) });
}
