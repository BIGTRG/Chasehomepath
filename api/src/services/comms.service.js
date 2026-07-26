import { query, withTransaction } from '../db/pool.js';
import { audit } from '../lib/audit.js';
import { NotFoundError } from '../lib/errors.js';
import { assertCanAccessMember } from './team.service.js';

/**
 * In-app communication (spec §8 "In-app communication only"). Everything flows through
 * message_threads/messages and appointments — no personal phone/email ever changes hands.
 */

/** One default thread per member; created on first use. */
export async function getOrCreateThread(memberId) {
  const { rows } = await query(
    `SELECT id, member_id, subject FROM message_threads
      WHERE member_id = $1 AND deleted_at IS NULL ORDER BY created_at ASC LIMIT 1`,
    [memberId],
  );
  if (rows[0]) return rows[0];
  const { rows: created } = await query(
    `INSERT INTO message_threads (member_id, subject) VALUES ($1, 'Your team') RETURNING id, member_id, subject`,
    [memberId],
  );
  return created[0];
}

async function memberIdForThread(threadId) {
  const { rows } = await query(
    `SELECT member_id FROM message_threads WHERE id = $1 AND deleted_at IS NULL`,
    [threadId],
  );
  if (!rows[0]) throw new NotFoundError('Thread not found');
  return rows[0].member_id;
}

export async function listMessages(user, threadId) {
  const memberId = await memberIdForThread(threadId);
  await assertCanAccessMember(user, memberId);
  const { rows } = await query(
    `SELECT id, sender_id, body, sent_at FROM messages
      WHERE thread_id = $1 AND deleted_at IS NULL ORDER BY sent_at ASC`,
    [threadId],
  );
  return rows;
}

export async function sendMessage(user, threadId, body, actor) {
  const memberId = await memberIdForThread(threadId);
  await assertCanAccessMember(user, memberId);
  return withTransaction(async (db) => {
    const { rows } = await db(
      `INSERT INTO messages (thread_id, sender_id, body) VALUES ($1, $2, $3)
       RETURNING id, thread_id, sender_id, body, sent_at`,
      [threadId, user.id, body],
    );
    await db(`UPDATE message_threads SET updated_at = now() WHERE id = $1`, [threadId]);
    await audit(
      { actorUserId: user.id, actorRole: actor.role, action: 'message.sent', entityType: 'message', entityId: rows[0].id, metadata: { threadId }, ...actor.reqMeta },
      db,
    );
    return rows[0];
  });
}

// ── Appointments ──────────────────────────────────────────────────────────

export async function createAppointment(memberId, { participantUserId, type, scheduledAt, isConsultation = false }, actor) {
  const { rows } = await query(
    `INSERT INTO appointments (member_id, participant_id, type, scheduled_at, is_consultation)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, member_id, participant_id, type, scheduled_at, status, is_consultation`,
    [memberId, participantUserId, type, scheduledAt, isConsultation],
  );
  await audit({ actorUserId: actor.userId, actorRole: actor.role, action: 'appointment.created', entityType: 'appointment', entityId: rows[0].id, metadata: { memberId, type, isConsultation }, ...actor.reqMeta });
  return rows[0];
}

export async function listAppointments(memberId) {
  const { rows } = await query(
    `SELECT id, participant_id, type, scheduled_at, status, is_consultation
       FROM appointments WHERE member_id = $1 AND deleted_at IS NULL
      ORDER BY scheduled_at DESC`,
    [memberId],
  );
  return rows;
}

/**
 * Update appointment status. Completing a consultation is what unlocks credit-score
 * visibility (spec §8 score-withheld rule reads this).
 */
export async function setAppointmentStatus(appointmentId, status, actor) {
  const { rows } = await query(
    `UPDATE appointments SET status = $2 WHERE id = $1 AND deleted_at IS NULL
      RETURNING id, member_id, status, is_consultation`,
    [appointmentId, status],
  );
  if (!rows[0]) throw new NotFoundError('Appointment not found');
  await audit({
    actorUserId: actor.userId, actorRole: actor.role,
    action: rows[0].is_consultation && status === 'completed' ? 'consultation.completed' : 'appointment.status_changed',
    entityType: 'appointment', entityId: appointmentId, metadata: { status }, ...actor.reqMeta,
  });
  return rows[0];
}

// ── Ratings ───────────────────────────────────────────────────────────────

/** Member rates a team member's responsiveness (1–5). History is retained. */
export async function submitRating(memberId, { ratedUserId, score }, actor) {
  const { rows } = await query(
    `INSERT INTO ratings (member_id, rated_user_id, responsiveness_score)
     VALUES ($1, $2, $3) RETURNING id, rated_user_id, responsiveness_score, submitted_at`,
    [memberId, ratedUserId, score],
  );
  await audit({ actorUserId: actor.userId, actorRole: actor.role, action: 'rating.submitted', entityType: 'rating', entityId: rows[0].id, metadata: { ratedUserId, score }, ...actor.reqMeta });
  return rows[0];
}
