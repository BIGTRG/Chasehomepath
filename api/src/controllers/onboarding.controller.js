import { z } from 'zod';
import * as onboarding from '../services/onboarding.service.js';

const actorFrom = (req) => ({
  userId: req.user.id,
  role: req.user.role,
  reqMeta: { ip: req.ip ?? null, userAgent: req.get('user-agent') ?? null },
});

const startSchema = z.object({
  userId: z.string().uuid(),
  roleType: z.enum(['w2', 'contractor', 'partner']),
});
export async function start(req, res) {
  const { userId, roleType } = startSchema.parse(req.body);
  res.status(201).json(await onboarding.startOnboarding(userId, roleType, actorFrom(req)));
}

const advanceSchema = z.object({ decision: z.enum(['pass', 'fail']) });
export async function advance(req, res) {
  const { decision } = advanceSchema.parse(req.body);
  res.json(await onboarding.advanceStep(req.params.stepId, decision, actorFrom(req)));
}

export async function queue(_req, res) {
  res.json({ queue: await onboarding.getQueue() });
}

export async function getCase(req, res) {
  res.json(await onboarding.getCase(req.params.caseId));
}
