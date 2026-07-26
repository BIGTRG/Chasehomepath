import { z } from 'zod';
import * as partner from '../services/partner.service.js';
import { submitPartnerListing } from '../services/ingestion.service.js';

const actorFrom = (req) => ({
  userId: req.user.id,
  role: req.user.role,
  reqMeta: { ip: req.ip ?? null, userAgent: req.get('user-agent') ?? null },
});

export async function profile(req, res) {
  res.json(await partner.getProfile(req.user.id));
}

export async function clients(req, res) {
  res.json({ clients: await partner.listAssignedClients(req.user.id) });
}

export async function myListings(req, res) {
  res.json({ listings: await partner.listMyListings(req.user.id) });
}

const listingSchema = z.object({
  type: z.enum(['house', 'lot', 'plan']),
  price: z.number().nonnegative().optional(),
  address: z.string().trim().optional(),
  beds: z.number().int().nonnegative().optional(),
  baths: z.number().nonnegative().optional(),
  sqft: z.number().int().nonnegative().optional(),
  foundation: z.string().optional(),
  remainingWorkCost: z.number().nonnegative().optional(),
});
export async function publish(req, res) {
  const body = listingSchema.parse(req.body);
  res.status(201).json({ listing: await submitPartnerListing(req.user.id, body, actorFrom(req)) });
}

const certSchema = z.object({
  licenseType: z.enum(['nc_broker', 'bic', 'nmls_mlo', 'nmls_entity']),
  licenseNumber: z.string().trim().min(1),
});
export async function submitCertification(req, res) {
  const body = certSchema.parse(req.body);
  res.status(201).json(await partner.submitCertification(req.user.id, body, actorFrom(req)));
}

/** Operator action: certify a partner after license verification. */
export async function certify(req, res) {
  res.json({ partner: await partner.certifyPartner(req.params.userId, actorFrom(req)) });
}
