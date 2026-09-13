import { z } from 'zod';
import * as billing from '../services/billing.service.js';
import * as meet from '../services/meet.service.js';

/** GET /api/meet/:code — room metadata + whether it is open for the caller. */
export async function info(req, res) {
  const access = await billing.roomAccess(req.user, req.params.code);
  res.json({ room: { ...access, present: meet.roomSize(req.params.code), iceServers: meet.ICE_SERVERS } });
}

/** GET /api/meet/:code/events — SSE signaling stream. Token via ?access_token (EventSource cannot set headers). */
export async function events(req, res) {
  const access = await billing.roomAccess(req.user, req.params.code);
  const name = access.role === 'host' ? 'Counselor' : 'Member';
  meet.join(req.params.code, req.user, res, { name, role: access.role });
}

const signalSchema = z.object({
  from: z.string().uuid(),
  to: z.string().uuid().optional(),
  type: z.enum(['offer', 'answer', 'ice']),
  payload: z.any(),
});
/** POST /api/meet/:code/signal — relay SDP / ICE to a peer. */
export async function signal(req, res) {
  await billing.roomAccess(req.user, req.params.code);
  const body = signalSchema.parse(req.body);
  const ok = meet.signal(req.params.code, body.from, body);
  res.json({ ok });
}
