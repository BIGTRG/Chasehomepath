import { z } from 'zod';
import * as operator from '../services/operator.service.js';
import * as admin from '../services/admin.service.js';

const actorFrom = (req) => ({
  userId: req.user.id,
  role: req.user.role,
  reqMeta: { ip: req.ip ?? null, userAgent: req.get('user-agent') ?? null },
});

export async function roster(req, res) {
  const { status, health } = req.query;
  res.json({ roster: await operator.roster(req.user, { status, health }) });
}

export async function clientDetail(req, res) {
  res.json(await operator.clientDetail(req.user, req.params.memberId));
}

export async function capacity(_req, res) {
  res.json({ capacity: await operator.capacity() });
}

export async function ratings(_req, res) {
  res.json({ ratings: await operator.ratingsDashboard() });
}

// ── Inventory ──
export async function inventory(req, res) {
  const { type, source, status } = req.query;
  res.json({ inventory: await admin.listInventory({ type, source, status }) });
}

export async function retire(req, res) {
  res.json({ listing: await admin.retireListing(req.params.id, actorFrom(req)) });
}

// ── HQ admin ──
export async function users(req, res) {
  res.json({ users: await admin.listUsers({ role: req.query.role }) });
}

const userPatch = z.object({
  role: z.enum(['member', 'specialist', 'manager', 'admin', 'partner']).optional(),
  status: z.enum(['pending', 'active', 'suspended', 'disabled']).optional(),
});
export async function patchUser(req, res) {
  const body = userPatch.parse(req.body);
  res.json({ user: await admin.setUserRoleStatus(req.params.id, body, actorFrom(req)) });
}

export async function programs(_req, res) {
  res.json({ programs: await admin.listPrograms() });
}

const programSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).optional(),
  source: z.enum(['nchfa', 'cplp', 'mcc', 'fha', 'dpa']).optional(),
  rulesJson: z.record(z.any()).optional(),
  active: z.boolean().optional(),
});
export async function upsertProgram(req, res) {
  const body = programSchema.parse(req.body);
  res.json({ program: await admin.upsertProgram(body, actorFrom(req)) });
}
