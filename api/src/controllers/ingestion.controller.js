import { z } from 'zod';
import * as ingest from '../services/ingestion.service.js';

const actorFrom = (req) => ({
  userId: req.user.id,
  role: req.user.role,
  reqMeta: { ip: req.ip ?? null, userAgent: req.get('user-agent') ?? null },
});

/** POST /api/ingest/mls — operator triggers an MLS sync. */
export async function runMls(req, res) {
  res.json(await ingest.ingestMls(actorFrom(req)));
}

const partnerListingSchema = z.object({
  type: z.enum(['house', 'lot', 'plan']),
  price: z.number().nonnegative().optional(),
  address: z.string().trim().optional(),
  geo: z.object({ lat: z.number(), lng: z.number() }).optional(),
  beds: z.number().int().nonnegative().optional(),
  baths: z.number().nonnegative().optional(),
  sqft: z.number().int().nonnegative().optional(),
  foundation: z.string().optional(),
  remainingWorkCost: z.number().nonnegative().optional(),
});

/** POST /api/ingest/partner-listings — partner submits inventory (held for approval). */
export async function submit(req, res) {
  const body = partnerListingSchema.parse(req.body);
  res.status(201).json({ listing: await ingest.submitPartnerListing(req.user.id, body, actorFrom(req)) });
}

/** GET /api/ingest/pending — operator sees submissions awaiting approval. */
export async function pending(_req, res) {
  res.json({ pending: await ingest.listPending() });
}

const reviewSchema = z.object({ decision: z.enum(['approve', 'reject']) });

/** POST /api/ingest/listings/:id/review — operator approves/rejects a pending listing. */
export async function review(req, res) {
  const { decision } = reviewSchema.parse(req.body);
  res.json({ listing: await ingest.reviewListing(req.params.id, decision, actorFrom(req)) });
}
