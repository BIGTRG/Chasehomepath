import fs from 'node:fs/promises';
import path from 'node:path';
import { query } from '../db/pool.js';
import { audit } from '../lib/audit.js';
import { ValidationError } from '../lib/errors.js';

/**
 * Intake funnel (walkthrough screens 2-5, spec §4.2-§4.6): the self-service
 * qualify form, credit-pull authorization, consultation scheduling, and the
 * pre-visit document checklist ("camera capture, not printing and scanning").
 */

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.resolve('uploads');
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024; // 8 MB per document
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/heic', 'image/webp', 'application/pdf']);

/** The pre-visit checklist. bank_link is satisfied by a live Plaid link, not an upload. */
export const CHECKLIST = Object.freeze([
  { docType: 'photo_id', label: 'Photo ID' },
  { docType: 'pay_stub_1', label: 'Last pay stub' },
  { docType: 'bank_link', label: 'Bank linked via Plaid' },
  { docType: 'employment', label: 'Employer & time on job' },
  { docType: 'pay_stub_2', label: 'Second pay stub' },
  { docType: 'co_applicant_id', label: 'Co-applicant ID' },
]);

export async function getIntake(memberId) {
  const { rows } = await query(
    `SELECT id, household_income, target_area, co_applicant, credit_authorized_at
       FROM intake_profiles
      WHERE member_id = $1 AND deleted_at IS NULL`,
    [memberId],
  );
  return rows[0] ?? null;
}

/**
 * Upsert the qualify data. Authorization is member-initiated and explicit —
 * we never set credit_authorized_at without `authorizeCreditPull: true` (§8).
 */
export async function saveIntake(memberId, { householdIncome, targetArea, coApplicant, authorizeCreditPull }, actor) {
  const { rows } = await query(
    `INSERT INTO intake_profiles (member_id, household_income, target_area, co_applicant, credit_authorized_at)
     VALUES ($1, $2, $3, $4, CASE WHEN $5 THEN now() ELSE NULL END)
     ON CONFLICT (member_id) WHERE deleted_at IS NULL
     DO UPDATE SET
       household_income = COALESCE(EXCLUDED.household_income, intake_profiles.household_income),
       target_area      = COALESCE(EXCLUDED.target_area, intake_profiles.target_area),
       co_applicant     = COALESCE(EXCLUDED.co_applicant, intake_profiles.co_applicant),
       credit_authorized_at = CASE WHEN $5 THEN COALESCE(intake_profiles.credit_authorized_at, now())
                                   ELSE intake_profiles.credit_authorized_at END
     RETURNING id, household_income, target_area, co_applicant, credit_authorized_at`,
    [memberId, householdIncome ?? null, targetArea ?? null, coApplicant ?? null, authorizeCreditPull === true],
  );
  await audit({
    actorUserId: actor?.userId ?? null,
    actorRole: actor?.role ?? null,
    action: authorizeCreditPull ? 'intake.saved_with_credit_authorization' : 'intake.saved',
    entityType: 'intake_profile',
    entityId: rows[0].id,
    metadata: { targetArea: targetArea ?? null },
    ip: actor?.reqMeta?.ip ?? null,
    userAgent: actor?.reqMeta?.userAgent ?? null,
  });
  return rows[0];
}

/** The document checklist with completion state. */
export async function getChecklist(memberId) {
  const { rows: docs } = await query(
    `SELECT doc_type, file_name, created_at FROM member_documents
      WHERE member_id = $1 AND deleted_at IS NULL`,
    [memberId],
  );
  const { rows: links } = await query(
    `SELECT 1 FROM bank_links WHERE member_id = $1 AND status = 'active' AND deleted_at IS NULL LIMIT 1`,
    [memberId],
  );
  const uploaded = new Map(docs.map((d) => [d.doc_type, d]));
  const items = CHECKLIST.map((c) => ({
    ...c,
    done: c.docType === 'bank_link' ? links.length > 0 : uploaded.has(c.docType),
  }));
  return { items, done: items.filter((i) => i.done).length, total: items.length };
}

/**
 * Store a captured document. Bytes land on disk (volume-mounted in prod, AES at
 * rest per GLBA posture is handled at the volume layer); metadata in Postgres.
 */
export async function saveDocument(memberId, { docType, fileName, mimeType, dataBase64 }, actor) {
  if (!ALLOWED_MIME.has(mimeType)) {
    throw new ValidationError(`Unsupported file type: ${mimeType}`);
  }
  const buf = Buffer.from(dataBase64, 'base64');
  if (buf.length === 0) throw new ValidationError('Empty file');
  if (buf.length > MAX_UPLOAD_BYTES) throw new ValidationError('File too large (8 MB max)');

  const safeName = String(fileName || 'document').replace(/[^\w.\-]/g, '_').slice(0, 120);
  const storageKey = `${memberId}/${docType}-${Date.now()}-${safeName}`;
  const target = path.join(UPLOAD_DIR, storageKey);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, buf);

  const { rows } = await query(
    `INSERT INTO member_documents (member_id, doc_type, file_name, mime_type, size_bytes, storage_key)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, doc_type, file_name, created_at`,
    [memberId, docType, safeName, mimeType, buf.length, storageKey],
  );
  await audit({
    actorUserId: actor?.userId ?? null,
    actorRole: actor?.role ?? null,
    action: 'intake.document_uploaded',
    entityType: 'member_document',
    entityId: rows[0].id,
    metadata: { docType, sizeBytes: buf.length },
    ip: actor?.reqMeta?.ip ?? null,
    userAgent: actor?.reqMeta?.userAgent ?? null,
  });
  return rows[0];
}

/**
 * Consultation slots: the next open weekday times. Deterministic generation —
 * real calendars arrive when the video/scheduling adapter is wired (§7).
 */
export function generateSlots(now = new Date(), count = 6) {
  const times = [
    { h: 10, m: 30 },
    { h: 14, m: 15 },
    { h: 16, m: 0 },
  ];
  const slots = [];
  const d = new Date(now);
  d.setDate(d.getDate() + 1);
  while (slots.length < count) {
    const day = d.getDay();
    if (day !== 0 && day !== 6) {
      for (const t of times) {
        if (slots.length >= count) break;
        const s = new Date(d);
        s.setHours(t.h, t.m, 0, 0);
        slots.push(s.toISOString());
      }
    }
    d.setDate(d.getDate() + 1);
  }
  return slots;
}

/**
 * Book the first consultation. Marks is_consultation = true — completing it is
 * what unlocks score visibility (§8). Participant = the member's lead staff
 * assignment, falling back to any active staff user.
 */
export async function bookConsultation(memberId, { type, scheduledAt }, actor) {
  const when = new Date(scheduledAt);
  if (Number.isNaN(when.getTime()) || when <= new Date()) {
    throw new ValidationError('scheduledAt must be a future date-time');
  }

  const { rows: leads } = await query(
    `SELECT ta.staff_or_partner_user AS user_id
       FROM team_assignments ta
      WHERE ta.member_id = $1 AND ta.assignee_kind = 'staff' AND ta.deleted_at IS NULL
      ORDER BY ta.assigned_at ASC LIMIT 1`,
    [memberId],
  );
  let participantId = leads[0]?.user_id;
  if (!participantId) {
    const { rows: staff } = await query(
      `SELECT u.id FROM users u
        WHERE u.role IN ('specialist', 'manager', 'admin') AND u.deleted_at IS NULL
        ORDER BY u.role = 'specialist' DESC, u.created_at ASC LIMIT 1`,
    );
    participantId = staff[0]?.id;
  }
  if (!participantId) throw new ValidationError('No staff available to book — contact support');

  const { rows } = await query(
    `INSERT INTO appointments (member_id, participant_id, type, scheduled_at, is_consultation)
     VALUES ($1, $2, $3, $4, true)
     RETURNING id, type, scheduled_at, status, is_consultation`,
    [memberId, participantId, type, when.toISOString()],
  );
  await audit({
    actorUserId: actor?.userId ?? null,
    actorRole: actor?.role ?? null,
    action: 'intake.consultation_booked',
    entityType: 'appointment',
    entityId: rows[0].id,
    metadata: { type, scheduledAt: when.toISOString() },
    ip: actor?.reqMeta?.ip ?? null,
    userAgent: actor?.reqMeta?.userAgent ?? null,
  });
  return rows[0];
}
