import { z } from 'zod';
import { requireMemberByUserId } from '../services/member.service.js';
import * as intake from '../services/intake.service.js';

const actorFrom = (req) => ({
  userId: req.user.id,
  role: req.user.role,
  reqMeta: { ip: req.ip ?? null, userAgent: req.get('user-agent') ?? null },
});

/** GET /api/intake — the member's qualify data + authorization state. */
export async function getMine(req, res) {
  const member = await requireMemberByUserId(req.user.id);
  const profile = await intake.getIntake(member.id);
  res.json({ intake: profile });
}

const saveSchema = z.object({
  householdIncome: z.number().nonnegative().max(100_000_000).optional(),
  targetArea: z.string().trim().min(1).max(200).optional(),
  coApplicant: z.object({ name: z.string().trim().min(1).max(120) }).nullish(),
  authorizeCreditPull: z.boolean().optional(),
});

/** POST /api/intake — save the qualify form. Authorization only when explicit (§8). */
export async function save(req, res) {
  const body = saveSchema.parse(req.body);
  const member = await requireMemberByUserId(req.user.id);
  const profile = await intake.saveIntake(member.id, body, actorFrom(req));
  res.status(201).json({ intake: profile });
}

/** GET /api/intake/checklist — the pre-visit document checklist (§4.6). */
export async function checklist(req, res) {
  const member = await requireMemberByUserId(req.user.id);
  res.json(await intake.getChecklist(member.id));
}

const docSchema = z.object({
  docType: z.enum(['photo_id', 'pay_stub_1', 'pay_stub_2', 'employment', 'co_applicant_id', 'other']),
  fileName: z.string().trim().min(1).max(200),
  mimeType: z.string().trim().min(3).max(100),
  dataBase64: z.string().min(1),
});

/** POST /api/intake/documents — camera-captured document upload. */
export async function uploadDocument(req, res) {
  const body = docSchema.parse(req.body);
  const member = await requireMemberByUserId(req.user.id);
  const doc = await intake.saveDocument(member.id, body, actorFrom(req));
  res.status(201).json({ document: doc });
}

/** GET /api/intake/slots — open consultation times. */
export async function slots(_req, res) {
  res.json({ slots: intake.generateSlots() });
}

const bookSchema = z.object({
  type: z.enum(['in_person', 'video']),
  scheduledAt: z.string().datetime({ offset: true }),
});

/** POST /api/intake/appointments — book the first consultation (unlock anchor, §8). */
export async function book(req, res) {
  const body = bookSchema.parse(req.body);
  const member = await requireMemberByUserId(req.user.id);
  const appointment = await intake.bookConsultation(member.id, body, actorFrom(req));
  res.status(201).json({ appointment });
}
