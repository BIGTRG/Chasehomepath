import { z } from 'zod';
import { requireMemberByUserId } from '../services/member.service.js';
import * as journey from '../services/journey.service.js';
import * as training from '../services/training.service.js';

const actorFrom = (req) => ({ userId: req.user.id, role: req.user.role, reqMeta: { ip: req.ip ?? null, userAgent: req.get('user-agent') ?? null } });
const memberOf = async (req) => ({ ...(await requireMemberByUserId(req.user.id)), email: req.user.email, name: req.user.name ?? null });

export async function status(req, res) {
  res.json(await journey.journeyStatus(await memberOf(req)));
}

const enrollSchema = z.object({ status: z.enum(['enrolled', 'linked', 'declined']).default('enrolled'), externalRef: z.string().max(120).optional() });
export async function enroll(req, res) {
  const body = enrollSchema.parse(req.body ?? {});
  res.status(201).json({ enrollment: await journey.enrollCreditMonitoring(await memberOf(req), body, actorFrom(req)) });
}

export async function startMeeting(req, res) {
  res.status(201).json({ meeting: await journey.startVirtualMeeting(await memberOf(req), actorFrom(req)) });
}
export async function getMeeting(req, res) {
  res.json({ meeting: await journey.getVirtualMeeting(await memberOf(req), req.params.id) });
}
const completeSchema = z.object({ chosenPlan: z.enum(['steady', 'focused', 'express']).nullable().optional() });
export async function completeMeeting(req, res) {
  const body = completeSchema.parse(req.body ?? {});
  res.json({ meeting: await journey.completeVirtualMeeting(await memberOf(req), req.params.id, body, actorFrom(req)) });
}

const proposeSchema = z.object({ days: z.array(z.enum(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'])).min(1).max(7), hour: z.number().int().min(6).max(22), minute: z.number().int().min(0).max(59).default(0) });
export async function propose(req, res) {
  const body = proposeSchema.parse(req.body ?? {});
  res.status(201).json(await training.proposeSchedule(await memberOf(req), body, actorFrom(req)));
}
export async function approve(req, res) {
  res.json(await training.approveSchedule(await memberOf(req), actorFrom(req)));
}
export async function schedule(req, res) {
  res.json(await training.mySchedule(await memberOf(req)));
}
export async function lesson(req, res) {
  res.json(await training.getLesson(await memberOf(req), req.params.moduleId));
}
const checkSchema = z.object({ answers: z.array(z.number().int().min(0).max(5)).min(1).max(10) });
export async function check(req, res) {
  const body = checkSchema.parse(req.body ?? {});
  res.json(await training.submitCheck(await memberOf(req), req.params.moduleId, body, actorFrom(req)));
}
