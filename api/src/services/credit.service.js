import { query, withTransaction } from '../db/pool.js';
import { NotFoundError, ConflictError, ComplianceError } from '../lib/errors.js';
import { encrypt } from '../lib/crypto.js';
import { audit } from '../lib/audit.js';
import { assertMemberInitiated, canRenderScore } from '../compliance/rules.js';
import { classifyItem, FCRA_RIGHTS } from '../credit/rulesEngine.js';
import { getCreditBureauAdapter } from '../integrations/creditBureau/index.js';

/** True once the member's first consultation appointment is marked complete (spec §8). */
export async function hasCompletedConsultation(memberId) {
  const { rows } = await query(
    `SELECT 1 FROM appointments
      WHERE member_id = $1 AND is_consultation = true AND status = 'completed'
        AND deleted_at IS NULL
      LIMIT 1`,
    [memberId],
  );
  return rows.length > 0;
}

/**
 * Pull a report through the bureau adapter, store it (raw encrypted), run the rules
 * engine on each item, and persist classifications + guidance. The score from the raw
 * report is NOT persisted as a member-visible field; it stays inside the encrypted raw.
 */
export async function ingestReport(member, actor) {
  const adapter = getCreditBureauAdapter();
  const report = await adapter.pullReport(member);

  return withTransaction(async (db) => {
    const { rows: reportRows } = await db(
      `INSERT INTO credit_reports (member_id, pulled_at, source, raw_ref)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [member.id, report.pulledAt, report.source, encrypt(JSON.stringify({ raw: report.raw, score: report.score }))],
    );
    const reportId = reportRows[0].id;

    for (const rawItem of report.items) {
      const classified = classifyItem(rawItem);
      await db(
        `INSERT INTO credit_items
           (report_id, creditor, type, balance, member_recorded_balance, classification, guidance_text)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          reportId,
          classified.creditor,
          classified.type,
          classified.balance,
          classified.member_recorded_balance,
          classified.classification,
          classified.guidance_text,
        ],
      );
    }

    await audit(
      {
        actorUserId: actor.userId,
        actorRole: actor.role,
        action: 'credit.report_ingested',
        entityType: 'credit_report',
        entityId: reportId,
        metadata: { source: report.source, itemCount: report.items.length },
        ...actor.reqMeta,
      },
      db,
    );

    return { reportId, itemCount: report.items.length };
  });
}

async function latestReportId(memberId) {
  const { rows } = await query(
    `SELECT id FROM credit_reports WHERE member_id = $1 AND deleted_at IS NULL
      ORDER BY pulled_at DESC LIMIT 1`,
    [memberId],
  );
  return rows[0]?.id ?? null;
}

/**
 * Credit overview (spec §4.8): items split disputable vs accurate. The score is
 * withheld until the first consultation is complete (spec §8) — before that we return
 * a withheld marker, never the number.
 */
export async function getCreditOverview(member) {
  const reportId = await latestReportId(member.id);
  if (!reportId) {
    return { hasReport: false, disputable: [], accurate: [], score: { withheld: true, reason: 'no_report' } };
  }

  const { rows: items } = await query(
    `SELECT ci.id, ci.creditor, ci.type, ci.balance, ci.member_recorded_balance,
            ci.classification, ci.guidance_text,
            EXISTS (
              SELECT 1 FROM disputes d
               WHERE d.credit_item_id = ci.id AND d.deleted_at IS NULL
                 AND d.status IN ('draft','filed','investigating')
            ) AS has_open_dispute
       FROM credit_items ci
      WHERE ci.report_id = $1 AND ci.deleted_at IS NULL
      ORDER BY ci.created_at ASC`,
    [reportId],
  );

  const consultDone = await hasCompletedConsultation(member.id);
  const score = canRenderScore({ firstConsultationCompleted: consultDone })
    ? await readScoreFromRaw(reportId)
    : { withheld: true, reason: 'awaiting_first_consultation' };

  return {
    hasReport: true,
    reportId,
    score,
    disputable: items.filter((i) => i.classification === 'disputable'),
    accurate: items.filter((i) => i.classification === 'accurate'),
  };
}

// Score lives only inside the encrypted raw; decrypt on demand once permitted.
async function readScoreFromRaw(reportId) {
  const { decrypt } = await import('../lib/crypto.js');
  const { rows } = await query(`SELECT raw_ref FROM credit_reports WHERE id = $1`, [reportId]);
  if (!rows[0]?.raw_ref) return { withheld: false, value: null };
  try {
    const parsed = JSON.parse(decrypt(rows[0].raw_ref));
    return { withheld: false, value: parsed.score ?? null };
  } catch {
    return { withheld: false, value: null };
  }
}

/**
 * Item detail (spec §4.9): the persisted finding (guidance) + the member's FCRA rights.
 * Nothing is pre-selected — we return whether an open dispute already exists, and the
 * member decides. No outcome promises anywhere.
 */
export async function getItemDetail(member, itemId) {
  const { rows } = await query(
    `SELECT ci.id, ci.creditor, ci.type, ci.balance, ci.member_recorded_balance,
            ci.classification, ci.guidance_text
       FROM credit_items ci
       JOIN credit_reports cr ON cr.id = ci.report_id
      WHERE ci.id = $1 AND cr.member_id = $2 AND ci.deleted_at IS NULL`,
    [itemId, member.id],
  );
  const item = rows[0];
  if (!item) throw new NotFoundError('Credit item not found');

  const { rows: disputes } = await query(
    `SELECT id, status, method, day_count, filed_at FROM disputes
      WHERE credit_item_id = $1 AND deleted_at IS NULL ORDER BY filed_at DESC`,
    [itemId],
  );

  return {
    item,
    rights: FCRA_RIGHTS,
    disputes,
    canDispute: item.classification === 'disputable',
    hasOpenDispute: disputes.some((d) => ['draft', 'filed', 'investigating'].includes(d.status)),
  };
}

/**
 * File a dispute — MEMBER-INITIATED ONLY (spec §8). The initiator's user id is required
 * and recorded; there is no code path that creates a dispute without a member action.
 */
export async function fileDispute(member, itemId, { method = 'online', initiatedByUserId }, actor) {
  assertMemberInitiated(initiatedByUserId); // ← self-directed credit work (§8)

  return withTransaction(async (db) => {
    const { rows: itemRows } = await db(
      `SELECT ci.id, ci.classification
         FROM credit_items ci
         JOIN credit_reports cr ON cr.id = ci.report_id
        WHERE ci.id = $1 AND cr.member_id = $2 AND ci.deleted_at IS NULL
        FOR UPDATE`,
      [itemId, member.id],
    );
    const item = itemRows[0];
    if (!item) throw new NotFoundError('Credit item not found');

    // Accuracy-first (§8): an accurate item is never disputed to pad numbers.
    // Enforced server-side, not just hidden in the UI.
    if (item.classification !== 'disputable') {
      throw new ComplianceError(
        'This item is reported accurately and cannot be disputed. Paying it down is the honest path.',
        'self_directed_credit_work',
      );
    }

    const { rows: open } = await db(
      `SELECT id FROM disputes
        WHERE credit_item_id = $1 AND deleted_at IS NULL
          AND status IN ('draft','filed','investigating')`,
      [itemId],
    );
    if (open[0]) throw new ConflictError('A dispute is already open for this item', 'dispute_open');

    const { rows: created } = await db(
      `INSERT INTO disputes (credit_item_id, member_id, initiated_by, status, method)
       VALUES ($1, $2, $3, 'filed', $4)
       RETURNING id, credit_item_id, status, method, day_count, filed_at`,
      [itemId, member.id, initiatedByUserId, method],
    );

    await audit(
      {
        actorUserId: initiatedByUserId,
        actorRole: actor.role,
        action: 'dispute.filed',
        entityType: 'dispute',
        entityId: created[0].id,
        metadata: { creditItemId: itemId, method },
        ...actor.reqMeta,
      },
      db,
    );
    return created[0];
  });
}

export async function withdrawDispute(member, disputeId, actor) {
  return withTransaction(async (db) => {
    const { rows } = await db(
      `UPDATE disputes SET status = 'withdrawn'
        WHERE id = $1 AND member_id = $2 AND deleted_at IS NULL
          AND status IN ('draft','filed','investigating')
        RETURNING id, status`,
      [disputeId, member.id],
    );
    if (!rows[0]) throw new NotFoundError('Open dispute not found');
    await audit(
      { actorUserId: actor.userId, actorRole: actor.role, action: 'dispute.withdrawn', entityType: 'dispute', entityId: disputeId, ...actor.reqMeta },
      db,
    );
    return rows[0];
  });
}

/** Dispute tracker (spec §4.11): all disputes for the member with status + day count. */
export async function listDisputes(member) {
  const { rows } = await query(
    `SELECT d.id, d.status, d.method, d.day_count, d.filed_at,
            ci.creditor, ci.type
       FROM disputes d
       JOIN credit_items ci ON ci.id = d.credit_item_id
      WHERE d.member_id = $1 AND d.deleted_at IS NULL
      ORDER BY d.filed_at DESC`,
    [member.id],
  );
  return rows;
}
