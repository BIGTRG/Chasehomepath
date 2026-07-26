import { query, withTransaction } from '../db/pool.js';
import { audit } from '../lib/audit.js';
import { encrypt } from '../lib/crypto.js';
import { NotFoundError, ForbiddenError, ValidationError } from '../lib/errors.js';
import { getEsignAdapter } from '../integrations/esign/index.js';
import { getLicenseAdapter } from '../integrations/licenseLookup/index.js';

async function partnerByUser(userId) {
  const { rows } = await query(`SELECT * FROM partners WHERE user_id = $1 AND deleted_at IS NULL`, [userId]);
  if (!rows[0]) throw new ForbiddenError('Not a partner account');
  return rows[0];
}

/** Profile & compliance (spec §6.4): cert status, licenses, agreements. */
export async function getProfile(userId) {
  const partner = await partnerByUser(userId);
  const { rows: licenses } = await query(
    `SELECT id, license_type, status, expires_at, verified_at FROM license_records
      WHERE user_id = $1 AND deleted_at IS NULL ORDER BY license_type`,
    [userId],
  );
  const { rows: agreements } = await query(
    `SELECT id, type, esigned_at FROM agreements WHERE user_id = $1 AND deleted_at IS NULL ORDER BY created_at`,
    [userId],
  );
  return {
    company: partner.company_name,
    partnerType: partner.partner_type,
    certificationStatus: partner.certification_status,
    verifiedAuthority: partner.verified_authority,
    licenses,
    agreements,
  };
}

/** Assigned clients (spec §6.2): only members this partner is on a team for. Display-only. */
export async function listAssignedClients(userId) {
  const { rows } = await query(
    `SELECT DISTINCT m.id AS member_id, u.email, ta.role_on_team,
            t.id AS thread_id
       FROM team_assignments ta
       JOIN members m ON m.id = ta.member_id AND m.deleted_at IS NULL
       JOIN users u ON u.id = m.user_id
       LEFT JOIN message_threads t ON t.member_id = m.id AND t.deleted_at IS NULL
      WHERE ta.staff_or_partner_user = $1 AND ta.deleted_at IS NULL`,
    [userId],
  );
  return rows.map((r) => ({ memberId: r.member_id, email: r.email, roleOnTeam: r.role_on_team, threadId: r.thread_id }));
}

export async function listMyListings(userId) {
  const partner = await partnerByUser(userId);
  const { rows } = await query(
    `SELECT id, type, source, status, price, address, created_at FROM listings
      WHERE partner_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC`,
    [partner.id],
  );
  return rows;
}

/**
 * Certification submission (spec §6.1): the partner e-signs the partner agreement and
 * records their license number. This moves them to 'in_review'. An operator certifies
 * after license verification (certifyPartner below). Nothing goes live before certification.
 */
export async function submitCertification(userId, { licenseType, licenseNumber }, actor) {
  await partnerByUser(userId);
  if (!licenseType || !licenseNumber) throw new ValidationError('licenseType and licenseNumber are required');

  const esign = getEsignAdapter();
  return withTransaction(async (db) => {
    const signed = await esign.sign({ type: 'partner', userId });
    await db(
      `INSERT INTO agreements (user_id, type, esigned_at, document_ref)
       VALUES ($1, 'partner', $2, $3)`,
      [userId, signed.esignedAt, encrypt(signed.documentRef)],
    );
    await db(
      `INSERT INTO license_records (user_id, license_type, number, status)
       VALUES ($1, $2, $3, 'unverified')`,
      [userId, licenseType, encrypt(licenseNumber)],
    );
    await db(`UPDATE partners SET certification_status = 'in_review' WHERE user_id = $1`, [userId]);
    await audit({ actorUserId: userId, actorRole: actor.role, action: 'partner.certification_submitted', entityType: 'user', entityId: userId, metadata: { licenseType }, ...actor.reqMeta }, db);
    return { certificationStatus: 'in_review' };
  });
}

/**
 * Operator certifies a partner: verify their license(s) via the lookup adapter, and only
 * on success set certification_status='certified' + verified_authority (spec §8).
 */
export async function certifyPartner(partnerUserId, actor) {
  const lookup = getLicenseAdapter();
  return withTransaction(async (db) => {
    const { rows: licenses } = await db(
      `SELECT id, license_type, number FROM license_records
        WHERE user_id = $1 AND deleted_at IS NULL FOR UPDATE`,
      [partnerUserId],
    );
    if (licenses.length === 0) throw new ValidationError('No license on file to verify');

    const { decrypt } = await import('../lib/crypto.js');
    let allActive = true;
    for (const lic of licenses) {
      const number = lic.number ? decrypt(lic.number) : null;
      const result = await lookup.verify({ licenseType: lic.license_type, number });
      await db(
        `UPDATE license_records SET status = $2, verified_at = $3 WHERE id = $1`,
        [lic.id, result.status, result.verifiedAt],
      );
      if (result.status !== 'active') allActive = false;
    }
    if (!allActive) throw new ForbiddenError('License verification failed; cannot certify');

    const { rows } = await db(
      `UPDATE partners SET certification_status = 'certified', verified_authority = true
        WHERE user_id = $1 AND deleted_at IS NULL RETURNING user_id, certification_status`,
      [partnerUserId],
    );
    if (!rows[0]) throw new NotFoundError('Partner not found');
    await audit({ actorUserId: actor.userId, actorRole: actor.role, action: 'partner.certified', entityType: 'user', entityId: partnerUserId, ...actor.reqMeta }, db);
    return rows[0];
  });
}
