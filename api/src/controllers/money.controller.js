import { z } from 'zod';
import { requireMemberByUserId } from '../services/member.service.js';
import * as money from '../services/money.service.js';

const actorFrom = (req) => ({
  userId: req.user.id,
  role: req.user.role,
  reqMeta: { ip: req.ip ?? null, userAgent: req.get('user-agent') ?? null },
});

export async function linkToken(req, res) {
  const member = await requireMemberByUserId(req.user.id);
  res.json(await money.createLinkToken(member));
}

const linkSchema = z.object({ publicToken: z.string().min(1) });
export async function link(req, res) {
  const { publicToken } = linkSchema.parse(req.body);
  const member = await requireMemberByUserId(req.user.id);
  res.status(201).json({ bankLink: await money.linkBank(member, publicToken, actorFrom(req)) });
}

export async function sync(req, res) {
  const member = await requireMemberByUserId(req.user.id);
  res.json(await money.syncTransactions(member, actorFrom(req)));
}

export async function overview(req, res) {
  const member = await requireMemberByUserId(req.user.id);
  res.json(await money.getMoneyOverview(member));
}

const budgetSchema = z.object({ category: z.string().trim().min(1), monthlyTarget: z.number().nonnegative() });
export async function setBudget(req, res) {
  const body = budgetSchema.parse(req.body);
  const member = await requireMemberByUserId(req.user.id);
  res.json({ budget: await money.upsertBudget(member, body, actorFrom(req)) });
}

const savingsSchema = z.object({
  id: z.string().uuid().optional(),
  label: z.string().trim().min(1).optional(),
  targetAmount: z.number().nonnegative().optional(),
  currentAmount: z.number().nonnegative().optional(),
});
export async function saveGoal(req, res) {
  const body = savingsSchema.parse(req.body);
  const member = await requireMemberByUserId(req.user.id);
  res.json({ goal: await money.upsertSavingsGoal(member, body, actorFrom(req)) });
}

export async function budgetProposal(req, res) {
  const member = await requireMemberByUserId(req.user.id);
  res.json(await money.proposeBudget(member));
}

const setupSchema = z.object({
  lines: z.array(z.object({ category: z.string().trim().min(1).max(40), monthlyTarget: z.number().nonnegative() })).max(40),
  toHome: z.number().nonnegative().optional(),
  downPaymentTarget: z.number().nonnegative().optional(),
});
export async function budgetSetup(req, res) {
  const body = setupSchema.parse(req.body);
  const member = await requireMemberByUserId(req.user.id);
  res.status(201).json(await money.setupBudget(member, body, actorFrom(req)));
}

export async function transactions(req, res) {
  const member = await requireMemberByUserId(req.user.id);
  res.json({ transactions: await money.recentTransactions(member.id, 60) });
}
