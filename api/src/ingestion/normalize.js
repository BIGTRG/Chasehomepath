/**
 * Ingestion normalization + quality gate (spec §9 Phase 8) — pure and deterministic.
 * Maps raw RESO/IDX records to our listing shape and screens out low-quality rows so
 * only clean inventory reaches the marketplace.
 */

const PROPERTY_TYPE_TO_TYPE = {
  Residential: 'house',
  ResidentialLease: 'house',
  Land: 'lot',
  Lots: 'lot',
};

/** Normalize one raw MLS record to our listing fields. */
export function normalizeMlsRecord(raw) {
  const type = PROPERTY_TYPE_TO_TYPE[raw.PropertyType] ?? 'house';
  const lat = raw.Latitude ?? null;
  const lng = raw.Longitude ?? null;
  return {
    type,
    source: 'mls',
    status: (raw.StandardStatus ?? '').toLowerCase() === 'active' ? 'active' : 'retired',
    price: numOrNull(raw.ListPrice),
    address: (raw.UnparsedAddress ?? '').trim() || null,
    geo: lat != null && lng != null ? { lat, lng } : null,
    beds: type === 'house' ? intOrNull(raw.BedroomsTotal) : null,
    baths: type === 'house' ? numOrNull(raw.BathroomsTotalInteger) : null,
    sqft: intOrNull(raw.LivingArea),
    mls_ref: raw.ListingKey ?? null,
  };
}

/**
 * Quality gate. Returns { ok, issues[] }. A record must have an mls_ref, a positive
 * price, an address, and (for houses) sane beds/baths/sqft to be publishable.
 */
export function qualityCheck(n) {
  const issues = [];
  if (!n.mls_ref) issues.push('missing mls_ref');
  if (!(Number(n.price) > 0)) issues.push('missing or non-positive price');
  if (!n.address) issues.push('missing address');
  if (n.type === 'house') {
    if (!(Number(n.sqft) > 0)) issues.push('missing sqft');
    if (n.beds == null || Number(n.beds) < 0) issues.push('missing beds');
    if (n.baths == null || Number(n.baths) < 0) issues.push('missing baths');
  }
  return { ok: issues.length === 0, issues };
}

function numOrNull(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function intOrNull(v) {
  const n = numOrNull(v);
  return n == null ? null : Math.trunc(n);
}
