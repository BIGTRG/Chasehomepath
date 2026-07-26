import { z } from 'zod';
import { requireMemberByUserId } from '../services/member.service.js';
import { answerQuestion } from '../services/agent.service.js';
import { getAssistanceForMember } from '../services/assistance.service.js';

const actorFrom = (req) => ({
  userId: req.user.id,
  role: req.user.role,
  reqMeta: { ip: req.ip ?? null, userAgent: req.get('user-agent') ?? null },
});

const askSchema = z.object({ question: z.string().trim().min(1).max(2000) });

/** POST /api/agent/ask — chat over the member's own file; escalates rate/term/legal. */
export async function ask(req, res) {
  const { question } = askSchema.parse(req.body);
  const member = await requireMemberByUserId(req.user.id);
  res.json(await answerQuestion(member, question, actorFrom(req)));
}

/** GET /api/assistance — evaluate assistance programs live and return matches. */
export async function assistance(req, res) {
  const member = await requireMemberByUserId(req.user.id);
  res.json(await getAssistanceForMember(member, actorFrom(req)));
}
