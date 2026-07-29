import { query, withTransaction } from '../db/pool.js';
import { audit } from '../lib/audit.js';
import { NotFoundError, ForbiddenError, ConflictError } from '../lib/errors.js';
import { getMlsAdapter } from '../integrations/mls/index.js';
import { normalizeMlsRecord, qualityCheck } from '../ingestion/normalize.js';

/**
 * MLS ingestion (spec §9 Phase 8): fetch → normalize → quality-gate → dedup → publish.
 * Returns counts so operators can see what happened. Low-quality and duplicate records
 * never reach the marketplace.
 */
export async function ingestMls(actor) {
  const adapter = getMlsAdapter();
  const raw = await adapter.fetchListings();

  const result = { fetched: raw.length, inserted: 0, skipped: 0, rejected: 0, rejections: [] };

  await withTransaction(async (db) => {
    for (const record of raw) {
      const n = normalizeMlsRecord(record);
      const quality = qualityCheck(n);
      if (!quality.ok) {
        result.rejected += 1;
        result.rejections.push({ mls_ref: n.mls_ref, issues: quality.issues });
        continue;
      }
      // Dedup on mls_ref (unique among living rows).
      const { rows: existing } = await db(
        `SELECT id FROM listings WHERE mls_ref = $1 AND deleted_at IS NULL`,
        [n.mls_ref],
      );
      if (existing[0]) {
        result.skipped += 1;
        continue;
      }
      await db(
        `INSERT INTO listings (type, source, status, price, address, geo, beds, baths, sqft, mls_ref)
         VALUES ($1,'mls',$2,$3,$4,$5,$6,$7,$8,$9)`,
        [n.type, n.status, n.price, n.address, n.geo, n.beds, n.baths, n.sqft, n.mls_ref],
      );
      result.inserted += 1;
    }
    await audit(
      { actorUserId: actor.userId, actorRole: actor.role, action: 'ingest.mls', entityType: 'listings', metadata: result, ...actor.reqMeta },
      db,
    );
  });

  return result;
}

/**
 * Partner-route publishing (spec §6.3): a partner submits a home/lot; it's held as
 * pending_approval until an operator approves (source labeling still applies).
 */
export async function submitPartnerListing(partnerUserId, data, actor) {
  const { rows: partnerRows } = await query(
    `SELECT id FROM partners WHERE user_id = $1 AND deleted_at IS NULL`,
    [partnerUserId],
  );
  const partner = partnerRows[0];
  if (!partner) throw new ForbiddenError('Only partners can publish inventory');

  const { rows } = await query(
    `INSERT INTO listings (type, source, status, price, address, geo, beds, baths, sqft, foundation, remaining_work_cost, partner_id)
     VALUES ($1,'partner','pending_approval',$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING id, type, source, status, price, address, partner_id`,
    [data.type, data.price ?? null, data.address ?? null, data.geo ?? null, data.beds ?? null,
     data.baths ?? null, data.sqft ?? null, data.foundation ?? null, data.remainingWorkCost ?? null, partner.id],
  );
  await audit({ actorUserId: partnerUserId, actorRole: actor.role, action: 'listing.submitted', entityType: 'listing', entityId: rows[0].id, metadata: { type: data.type }, ...actor.reqMeta });
  return rows[0];
}

export async function listPending() {
  const { rows } = await query(
    `SELECT l.id, l.type, l.source, l.status, l.price, l.address, l.partner_id,
            p.company_name, p.certification_status
       FROM listings l
       LEFT JOIN partners p ON p.id = l.partner_id
      WHERE l.status = 'pending_approval' AND l.deleted_at IS NULL
      ORDER BY l.created_at ASC`,
  );
  return rows;
}

/**
 * Operator review of a pending listing. Approving a PARTNER listing requires the partner
 * to be certified first (spec §6.1: nothing goes live before certification).
 */
export async function reviewListing(listingId, decision, actor) {
  return withTransaction(async (db) => {
    const { rows } = await db(
      `SELECT l.id, l.source, l.status, l.partner_id, p.certification_status
         FROM listings l LEFT JOIN partners p ON p.id = l.partner_id
        WHERE l.id = $1 AND l.deleted_at IS NULL FOR UPDATE OF l`,
      [listingId],
    );
    const listing = rows[0];
    if (!listing) throw new NotFoundError('Listing not found');
    if (listing.status !== 'pending_approval') throw new ConflictError('Listing is not pending approval');

    if (decision === 'approve') {
      if (listing.source === 'partner' && listing.certification_status !== 'certified') {
        throw new ForbiddenError('Partner must be certified before their listing can go live');
      }
      const { rows: up } = await db(`UPDATE listings SET status = 'active' WHERE id = $1 RETURNING id, status`, [listingId]);
      await audit({ actorUserId: actor.userId, actorRole: actor.role, action: 'listing.approved', entityType: 'listing', entityId: listingId, ...actor.reqMeta }, db);
      return up[0];
    }
    const { rows: up } = await db(`UPDATE listings SET status = 'retired' WHERE id = $1 RETURNING id, status`, [listingId]);
    await audit({ actorUserId: actor.userId, actorRole: actor.role, action: 'listing.rejected', entityType: 'listing', entityId: listingId, ...actor.reqMeta }, db);
    return up[0];
  });
}
