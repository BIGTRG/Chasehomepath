import { z } from 'zod';
import { requireMemberByUserId } from '../services/member.service.js';
import {
  getPlanForMember,
  setMilestoneCompletion,
  updateTrackProgress,
  markPlacementReady,
} from '../services/plan.service.js';

const actorFrom = (req) => ({
  userId: req.user.id,
  role: req.user.role,
  reqMeta: { ip: req.ip ?? null, userAgent: req.get('user-agent') ?? null },
});

/** GET /api/plan — the authenticated member's plan home (spec §4.7). */
export async function getMyPlan(req, res) {
  const member = await requireMemberByUserId(req.user.id);
  const plan = await getPlanForMember(member.id);
  res.json({ plan });
}

const milestoneSchema = z.object({ completed: z.boolean() });

/** PATCH /api/plan/milestones/:id — member marks their own milestone done/undone. */
export async function patchMilestone(req, res) {
  const { completed } = milestoneSchema.parse(req.body);
  const member = await requireMemberByUserId(req.user.id);
  const milestone = await setMilestoneCompletion(member.id, req.params.id, completed, actorFrom(req));
  res.json({ milestone });
}

// ── Operator-facing (staff/manager/admin) ──

const trackSchema = z.object({
  progressPct: z.number().int().min(0).max(100).optional(),
  status: z.enum(['not_started', 'in_progress', 'blocked', 'complete']).optional(),
});

/** PATCH /api/plan/:memberId/tracks/:trackType — staff updates track progress. */
export async function patchTrack(req, res) {
  const body = trackSchema.parse(req.body);
  const track = await updateTrackProgress(req.params.memberId, req.params.trackType, body, actorFrom(req));
  res.json({ track });
}

/** POST /api/plan/:memberId/placement-ready — enforces the 90-day rule in code (§8). */
export async function postPlacementReady(req, res) {
  const plan = await markPlacementReady(req.params.memberId, actorFrom(req));
  res.json({ plan });
}
