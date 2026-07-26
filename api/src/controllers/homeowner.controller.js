import { z } from 'zod';
import { requireMemberByUserId } from '../services/member.service.js';
import * as home from '../services/homeowner.service.js';

const actorFrom = (req) => ({
  userId: req.user.id,
  role: req.user.role,
  reqMeta: { ip: req.ip ?? null, userAgent: req.get('user-agent') ?? null },
});

export async function dashboard(req, res) {
  const member = await requireMemberByUserId(req.user.id);
  res.json(await home.getDashboard(member));
}

const recordSchema = z.object({
  listingId: z.string().uuid().optional(),
  address: z.string().trim().optional(),
  purchasePrice: z.number().nonnegative(),
  purchaseDate: z.string().date().optional(),
  mortgageBalance: z.number().nonnegative().optional(),
  interestRate: z.number().min(0).max(1).optional(), // fraction, e.g. 0.0675
  monthlyEscrow: z.number().nonnegative().optional(),
  monthlyTaxes: z.number().nonnegative().optional(),
  monthlyInsurance: z.number().nonnegative().optional(),
});
export async function record(req, res) {
  const body = recordSchema.parse(req.body);
  const member = await requireMemberByUserId(req.user.id);
  res.status(201).json(await home.recordHomeownership(member, body, actorFrom(req)));
}

export async function completeMaintenance(req, res) {
  const member = await requireMemberByUserId(req.user.id);
  res.json({ task: await home.completeMaintenance(member, req.params.id, actorFrom(req)) });
}
