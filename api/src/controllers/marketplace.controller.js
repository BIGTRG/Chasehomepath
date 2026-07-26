import { findMemberByUserId } from '../services/member.service.js';
import * as market from '../services/marketplace.service.js';

// Members get per-member enrichment (assistance-applied pricing); staff/partners browse
// without it. We resolve the member if the caller is one.
async function memberIfAny(req) {
  if (req.user?.role !== 'member') return null;
  return findMemberByUserId(req.user.id);
}

export async function listings(req, res) {
  const member = await memberIfAny(req);
  const { type, source } = req.query;
  res.json({ listings: await market.listListings({ type, source }, member) });
}

export async function listing(req, res) {
  const member = await memberIfAny(req);
  res.json({ listing: await market.getListing(req.params.id, member) });
}

export async function plans(_req, res) {
  res.json({ plans: await market.listHousePlans() });
}

export async function planLots(req, res) {
  const member = await memberIfAny(req);
  res.json(await market.matchLotsForPlan(req.params.planId, member));
}
