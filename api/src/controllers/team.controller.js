import { z } from 'zod';
import { requireMemberByUserId } from '../services/member.service.js';
import {
  listTeamForMember,
  assignTeamMember,
  removeAssignment,
} from '../services/team.service.js';
import {
  getOrCreateThread,
  listMessages,
  sendMessage,
  createAppointment,
  listAppointments,
  setAppointmentStatus,
  submitRating,
} from '../services/comms.service.js';

const actorFrom = (req) => ({
  userId: req.user.id,
  role: req.user.role,
  reqMeta: { ip: req.ip ?? null, userAgent: req.get('user-agent') ?? null },
});

// ── Member-facing ──

/** GET /api/team — the member's team (display-only, no PII), their thread id, appointments. */
export async function myTeam(req, res) {
  const member = await requireMemberByUserId(req.user.id);
  const [team, thread, appointments] = await Promise.all([
    listTeamForMember(member.id),
    getOrCreateThread(member.id),
    listAppointments(member.id),
  ]);
  res.json({ team, threadId: thread.id, appointments });
}

const messageSchema = z.object({ body: z.string().trim().min(1).max(5000) });

export async function getThreadMessages(req, res) {
  res.json({ messages: await listMessages(req.user, req.params.threadId) });
}

export async function postThreadMessage(req, res) {
  const { body } = messageSchema.parse(req.body);
  const message = await sendMessage(req.user, req.params.threadId, body, actorFrom(req));
  res.status(201).json({ message });
}

const ratingSchema = z.object({ ratedUserId: z.string().uuid(), score: z.number().int().min(1).max(5) });

export async function rate(req, res) {
  const body = ratingSchema.parse(req.body);
  const member = await requireMemberByUserId(req.user.id);
  res.status(201).json({ rating: await submitRating(member.id, body, actorFrom(req)) });
}

// ── Operator-facing (staff/manager/admin) ──

const assignSchema = z.object({
  assigneeUserId: z.string().uuid(),
  assigneeKind: z.enum(['staff', 'partner']),
  roleOnTeam: z.string().trim().min(1),
});

export async function assign(req, res) {
  const body = assignSchema.parse(req.body);
  res.status(201).json({ assignment: await assignTeamMember(req.params.memberId, body, actorFrom(req)) });
}

export async function unassign(req, res) {
  await removeAssignment(req.params.id, actorFrom(req));
  res.status(204).end();
}

const apptSchema = z.object({
  participantUserId: z.string().uuid(),
  type: z.enum(['in_person', 'video', 'call']),
  scheduledAt: z.string().datetime(),
  isConsultation: z.boolean().optional(),
});

export async function createAppt(req, res) {
  const body = apptSchema.parse(req.body);
  res.status(201).json({ appointment: await createAppointment(req.params.memberId, body, actorFrom(req)) });
}

const apptStatusSchema = z.object({ status: z.enum(['scheduled', 'completed', 'cancelled', 'no_show']) });

export async function updateAppt(req, res) {
  const { status } = apptStatusSchema.parse(req.body);
  res.json({ appointment: await setAppointmentStatus(req.params.id, status, actorFrom(req)) });
}
