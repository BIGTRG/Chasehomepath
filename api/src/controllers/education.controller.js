import { requireMemberByUserId } from '../services/member.service.js';
import { getLearnForMember, markModuleDone } from '../services/education.service.js';

const actorFrom = (req) => ({
  userId: req.user.id,
  role: req.user.role,
  reqMeta: { ip: req.ip ?? null, userAgent: req.get('user-agent') ?? null },
});

/** GET /api/learn — assigned curriculum grouped before/during/after, with lock/unlock. */
export async function myLearn(req, res) {
  const member = await requireMemberByUserId(req.user.id);
  res.json(await getLearnForMember(member.id));
}

/** POST /api/learn/:moduleId/done — member completes an available module. */
export async function complete(req, res) {
  const member = await requireMemberByUserId(req.user.id);
  res.json({ module: await markModuleDone(member.id, req.params.moduleId, actorFrom(req)) });
}
