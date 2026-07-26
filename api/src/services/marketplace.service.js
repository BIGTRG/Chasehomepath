import { query } from '../db/pool.js';
import { NotFoundError } from '../lib/errors.js';
import { estimatedMonthly, evaluateFit, allInCost } from '../marketplace/estimate.js';

// Friendly source labels — origin is ALWAYS shown, never hidden (spec §8 source labeling).
const SOURCE_LABEL = {
  owned: 'CHASE-owned',
  optioned: 'CHASE-optioned',
  partner: 'Partner',
  mls: 'MLS',
};

export function sourceLabel(source) {
  return SOURCE_LABEL[source] ?? source;
}

/** Total assistance a member is eligible for (program_matches; populated in Phase 9). */
async function assistanceForMember(memberId) {
  if (!memberId) return 0;
  const { rows } = await query(
    `SELECT COALESCE(SUM(amount), 0)::numeric(14,2) AS total
       FROM program_matches WHERE member_id = $1 AND eligible = true AND deleted_at IS NULL`,
    [memberId],
  );
  return Number(rows[0].total);
}

function shape(listing, { assistance = 0 } = {}) {
  const estMonthly =
    listing.type === 'lot' ? null : estimatedMonthly(listing.price, { assistance });
  return {
    id: listing.id,
    type: listing.type,
    source: listing.source,
    sourceLabel: sourceLabel(listing.source), // never omit origin
    status: listing.status,
    price: listing.price != null ? Number(listing.price) : null,
    address: listing.address,
    geo: listing.geo,
    beds: listing.beds,
    baths: listing.baths != null ? Number(listing.baths) : null,
    sqft: listing.sqft,
    foundation: listing.foundation,
    remainingWorkCost: listing.remaining_work_cost != null ? Number(listing.remaining_work_cost) : null,
    mlsRef: listing.mls_ref,
    estMonthly,
    assistanceApplied: assistance,
  };
}

export async function listListings({ type, source } = {}, member) {
  const clauses = [`deleted_at IS NULL`, `status = 'active'`];
  const params = [];
  if (type) { params.push(type); clauses.push(`type = $${params.length}`); }
  if (source) { params.push(source); clauses.push(`source = $${params.length}`); }

  const { rows } = await query(
    `SELECT * FROM listings WHERE ${clauses.join(' AND ')} ORDER BY price ASC`,
    params,
  );
  const assistance = await assistanceForMember(member?.id);
  return rows.map((l) => shape(l, { assistance }));
}

export async function getListing(id, member) {
  const { rows } = await query(`SELECT * FROM listings WHERE id = $1 AND deleted_at IS NULL`, [id]);
  if (!rows[0]) throw new NotFoundError('Listing not found');
  const assistance = await assistanceForMember(member?.id);
  const shaped = shape(rows[0], { assistance });

  // Persist per-member enrichment (spec §3 listing_enrichment) when a member views it.
  if (member?.id && shaped.estMonthly != null) {
    await query(
      `INSERT INTO listing_enrichment (listing_id, member_id, est_monthly, assistance_matched)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (listing_id, member_id) WHERE deleted_at IS NULL
       DO UPDATE SET est_monthly = EXCLUDED.est_monthly, assistance_matched = EXCLUDED.assistance_matched`,
      [id, member.id, shaped.estMonthly, JSON.stringify({ total: assistance })],
    );
  }
  return shaped;
}

export async function listHousePlans() {
  const { rows } = await query(
    `SELECT id, name, beds, baths, sqft, foundation, est_build_low, est_build_high, build_months, priority_tags
       FROM house_plans WHERE deleted_at IS NULL ORDER BY sqft ASC`,
  );
  return rows.map((p) => ({
    ...p,
    baths: Number(p.baths),
    estBuildLow: Number(p.est_build_low),
    estBuildHigh: Number(p.est_build_high),
  }));
}

/**
 * Plan-to-lot matching (spec §4.15): given a house plan, return fitting lots with the
 * all-in (lot + build) number and an estimated monthly payment.
 */
export async function matchLotsForPlan(planId, member) {
  const { rows: planRows } = await query(`SELECT * FROM house_plans WHERE id = $1 AND deleted_at IS NULL`, [planId]);
  const plan = planRows[0];
  if (!plan) throw new NotFoundError('House plan not found');

  const { rows: lots } = await query(
    `SELECT * FROM listings WHERE type = 'lot' AND status = 'active' AND deleted_at IS NULL`,
  );
  const assistance = await assistanceForMember(member?.id);

  const matches = [];
  for (const lot of lots) {
    const fit = evaluateFit(lot, plan);
    // Persist the fit result (spec §3 lot_plan_fit).
    await query(
      `INSERT INTO lot_plan_fit (lot_listing_id, house_plan_id, fits, reason)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (lot_listing_id, house_plan_id) WHERE deleted_at IS NULL
       DO UPDATE SET fits = EXCLUDED.fits, reason = EXCLUDED.reason`,
      [lot.id, planId, fit.fits, fit.reason],
    );
    if (!fit.fits) continue;
    const allIn = allInCost(lot, plan);
    matches.push({
      lot: shape(lot, { assistance }),
      fit,
      allIn,
      estMonthly: estimatedMonthly(allIn, { assistance }),
    });
  }
  matches.sort((a, b) => a.allIn - b.allIn);
  return {
    plan: { id: plan.id, name: plan.name, sqft: plan.sqft, beds: plan.beds, baths: Number(plan.baths) },
    matches,
  };
}
