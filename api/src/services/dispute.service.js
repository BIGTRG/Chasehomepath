import { query, withTransaction } from '../db/pool.js';
import { NotFoundError, ConflictError, ComplianceError, ValidationError } from '../lib/errors.js';
import { audit } from '../lib/audit.js';
import { assertMemberInitiated } from '../compliance/rules.js';
import { COUNSELOR } from '../lib/counselor.js';
import { BUREAUS, REASONS, bureauDispute, movRequest, furnisherDirect, debtValidation, cfpbComplaint, sendingSteps } from '../credit/letters.js';

/**
 * Do-it-yourself dispute workflow. Maren drafts every letter and tells the member the next
 * step; the member edits, signs, sends, and records what came back. There is no code path
 * that sends anything to a bureau or furnisher (spec §8; CROA line: education, not repair).
 */

const OPEN = ['draft', 'filed', 'investigating'];
const BUREAU_KEYS = Object.keys(BUREAUS);
const RESPONSE_DAYS = 30;
const MAIL_DAYS = 5;

// ---------------------------------------------------------------------------
// Member identity for the letterhead
// ---------------------------------------------------------------------------
async function letterhead(member, db = query) {
  const { rows } = await db(
    `SELECT u.display_name, u.email, ip.mailing_address, ip.date_of_birth
       FROM members m JOIN users u ON u.id = m.user_id
       LEFT JOIN intake_profiles ip ON ip.member_id = m.id AND ip.deleted_at IS NULL
      WHERE m.id = $1`,
    [member.id],
  );
  const r = rows[0] ?? {};
  return { name: r.display_name || '[your full name]', address: r.mailing_address ?? null, dob: r.date_of_birth ?? null, complete: Boolean(r.display_name && r.mailing_address?.line1 && r.date_of_birth) };
}

export async function getLetterhead(member) {
  return letterhead(member);
}

export async function setLetterhead(member, { line1, line2, city, state, zip, dateOfBirth }, actor) {
  if (!line1 || !city || !state || !zip) throw new ValidationError('Street, city, state, and ZIP are required');
  if (!/^[A-Za-z]{2}$/.test(state)) throw new ValidationError('State must be two letters');
  if (!/^\d{5}(-\d{4})?$/.test(zip)) throw new ValidationError('ZIP must be 5 digits');
  if (dateOfBirth && Number.isNaN(Date.parse(dateOfBirth))) throw new ValidationError('Date of birth is not a valid date');
  const address = { line1: line1.trim(), line2: (line2 ?? '').trim() || null, city: city.trim(), state: state.toUpperCase(), zip };
  await query(
    `INSERT INTO intake_profiles (member_id, mailing_address, date_of_birth) VALUES ($1, $2, $3)
     ON CONFLICT (member_id) WHERE deleted_at IS NULL
     DO UPDATE SET mailing_address = EXCLUDED.mailing_address,
                   date_of_birth = COALESCE(EXCLUDED.date_of_birth, intake_profiles.date_of_birth)`,
    [member.id, JSON.stringify(address), dateOfBirth ?? null],
  );
  await audit({ actorUserId: actor.userId, actorRole: actor.role, action: 'dispute.letterhead_set', entityType: 'member', entityId: member.id, ...actor.reqMeta });
  await refreshDraftLetters(member);
  return letterhead(member);
}

/** Unsigned round-1 bureau drafts are re-rendered so the new letterhead lands on them. */
async function refreshDraftLetters(member) {
  const head = await letterhead(member);
  const { rows } = await query(
    `SELECT l.id, l.recipient_key, d.reason_code, d.details, ci.creditor, ci.type, ci.balance
       FROM dispute_letters l JOIN disputes d ON d.id = l.dispute_id JOIN credit_items ci ON ci.id = d.credit_item_id
      WHERE l.member_id = $1 AND l.status = 'draft' AND l.kind = 'bureau_dispute' AND l.deleted_at IS NULL AND d.status = 'draft'`,
    [member.id],
  );
  for (const r of rows) {
    const l = bureauDispute({ member: head, item: r, reasonCode: r.reason_code, details: r.details, bureauKey: r.recipient_key });
    await query(`UPDATE dispute_letters SET body = $2 WHERE id = $1`, [r.id, l.body]);
  }
}

// ---------------------------------------------------------------------------
// Start: item + reason -> dispute in draft with one letter per bureau
// ---------------------------------------------------------------------------
export async function startDispute(member, itemId, { reasonCode, details, bureaus, initiatedByUserId }, actor) {
  assertMemberInitiated(initiatedByUserId);
  if (!REASONS[reasonCode]) throw new ValidationError('Pick a reason from the list');
  const chosen = (bureaus?.length ? bureaus : BUREAU_KEYS).filter((b) => BUREAU_KEYS.includes(b));
  if (chosen.length === 0) throw new ValidationError('Pick at least one bureau');
  if (details && details.length > 1500) throw new ValidationError('Keep the details under 1,500 characters');

  return withTransaction(async (db) => {
    const { rows: itemRows } = await db(
      `SELECT ci.id, ci.creditor, ci.type, ci.balance, ci.classification
         FROM credit_items ci JOIN credit_reports cr ON cr.id = ci.report_id
        WHERE ci.id = $1 AND cr.member_id = $2 AND ci.deleted_at IS NULL FOR UPDATE`,
      [itemId, member.id],
    );
    const item = itemRows[0];
    if (!item) throw new NotFoundError('Credit item not found');
    if (item.classification !== 'disputable') {
      throw new ComplianceError('This item is reported accurately and cannot be disputed. Paying it down is the honest path.', 'self_directed_credit_work');
    }
    const { rows: open } = await db(
      `SELECT id FROM disputes WHERE credit_item_id = $1 AND deleted_at IS NULL AND status = ANY($2)`,
      [itemId, OPEN],
    );
    if (open[0]) throw new ConflictError('A dispute is already open for this item', 'dispute_open');

    const { rows: created } = await db(
      `INSERT INTO disputes (credit_item_id, member_id, initiated_by, status, method, reason_code, details, bureaus)
       VALUES ($1, $2, $3, 'draft', 'mail', $4, $5, $6) RETURNING id`,
      [itemId, member.id, initiatedByUserId, reasonCode, details?.trim() || null, chosen],
    );
    const disputeId = created[0].id;
    const head = await letterhead(member, db);
    for (const b of chosen) {
      const l = bureauDispute({ member: head, item, reasonCode, details, bureauKey: b });
      await insertLetter(db, disputeId, member.id, 1, l);
    }
    await db(`INSERT INTO dispute_events (dispute_id, kind, text, meta) VALUES ($1, 'started', $2, $3)`,
      [disputeId, `You started this dispute: ${REASONS[reasonCode].label}. ${COUNSELOR.name} drafted ${chosen.length} letter${chosen.length > 1 ? 's' : ''}.`, JSON.stringify({ reasonCode, bureaus: chosen })]);
    await audit({ actorUserId: initiatedByUserId, actorRole: actor.role, action: 'dispute.started', entityType: 'dispute', entityId: disputeId, metadata: { creditItemId: itemId, reasonCode, bureaus: chosen }, ...actor.reqMeta }, db);
    return getDispute(member, disputeId, db);
  });
}

async function insertLetter(db, disputeId, memberId, round, l) {
  const { rows } = await db(
    `INSERT INTO dispute_letters (dispute_id, member_id, round, kind, recipient_key, recipient_name, recipient_addr, body)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [disputeId, memberId, round, l.kind, l.recipientKey, l.recipientName, l.recipientAddr, l.body],
  );
  return rows[0].id;
}

// ---------------------------------------------------------------------------
// Read: the case, with Maren's next step
// ---------------------------------------------------------------------------
export async function getDispute(member, disputeId, db = query) {
  const { rows } = await db(
    `SELECT d.*, d.due_at::text AS due_at, ci.creditor, ci.type, ci.balance
       FROM disputes d JOIN credit_items ci ON ci.id = d.credit_item_id
      WHERE d.id = $1 AND d.member_id = $2 AND d.deleted_at IS NULL`,
    [disputeId, member.id],
  );
  const d = rows[0];
  if (!d) throw new NotFoundError('Dispute not found');
  const { rows: letters } = await db(
    `SELECT id, round, kind, recipient_key, recipient_name, recipient_addr, body, status, signed_name, approved_at, sent_at::text AS sent_at, sent_method, tracking, created_at
       FROM dispute_letters WHERE dispute_id = $1 AND deleted_at IS NULL ORDER BY round, created_at`,
    [disputeId],
  );
  const { rows: events } = await db(`SELECT id, kind, text, meta, created_at FROM dispute_events WHERE dispute_id = $1 ORDER BY created_at`, [disputeId]);
  const head = await letterhead(member, db);
  return {
    dispute: {
      id: d.id, status: d.status, round: d.round, reasonCode: d.reason_code, reasonLabel: REASONS[d.reason_code]?.label ?? d.reason_code,
      details: d.details, bureaus: d.bureaus, filedAt: d.filed_at, dueAt: d.due_at, dayCount: liveDays(d),
      outcome: d.outcome, outcomeAt: d.outcome_at, outcomeNote: d.outcome_note,
      item: { id: d.credit_item_id, creditor: d.creditor, type: d.type, balance: d.balance },
    },
    letters: letters.map((l) => ({ ...l, steps: sendingSteps(l.kind), online: BUREAUS[l.recipient_key]?.online ?? (l.recipient_key === 'cfpb' ? 'https://www.consumerfinance.gov/complaint/' : null) })),
    events,
    letterhead: head,
    evidence: REASONS[d.reason_code]?.evidence ?? [],
    next: nextStep(d, letters, head),
    counselor: { name: COUNSELOR.name, disclosure: COUNSELOR.disclosure },
  };
}

const liveDays = (d) => (['filed', 'investigating', 'resolved'].includes(d.status) && d.filed_at ? Math.max(0, Math.floor((Date.now() - new Date(d.filed_at).getTime()) / 86400000)) : 0);

/** Maren's guidance, computed from the state. One action at a time. */
export function nextStep(d, letters, head) {
  const cur = letters.filter((l) => l.round === d.round);
  if (d.status === 'withdrawn') return { code: 'closed', title: 'You withdrew this dispute', text: 'Nothing else to do. You can start again from the credit item if something changes.' };
  if (d.status === 'resolved') {
    return d.outcome === 'deleted' || d.outcome === 'updated'
      ? { code: 'closed', title: d.outcome === 'deleted' ? 'Removed from your report' : 'Corrected on your report', text: 'Pull your updated report to confirm it shows the change at every bureau you wrote to. Keep every letter and receipt for your records.' }
      : { code: 'closed', title: 'Closed', text: 'This dispute is closed.' };
  }
  if (!head.complete) return { code: 'letterhead', title: 'Add your mailing address and date of birth', text: 'The bureaus match your letter to your file by name, address, and date of birth. Enter them once; every letter uses them.' };
  const drafts = cur.filter((l) => l.status === 'draft');
  if (drafts.length) return { code: 'review', title: `Review and sign ${drafts.length === 1 ? 'your letter' : `${drafts.length} letters`}`, text: 'Read each one. Change anything that is not exactly your situation, then sign with your name.', letterId: drafts[0].id };
  const approved = cur.filter((l) => l.status === 'approved');
  if (approved.length) return { code: 'send', title: `Print and send ${approved.length === 1 ? 'your letter' : `${approved.length} letters`}`, text: 'Certified mail with return receipt is best; the receipt is your proof of the date. Or copy the text into the bureau portal. Mark each one sent when it is on its way.', letterId: approved[0].id };
  if (d.status === 'filed' || d.status === 'investigating') {
    const due = d.due_at ? (d.due_at instanceof Date ? new Date(d.due_at.getTime() + 12 * 3600 * 1000) : new Date(`${String(d.due_at).slice(0, 10)}T12:00:00`)) : null;
    const overdue = due && due < new Date();
    if (!d.outcome && !overdue) return { code: 'wait', title: 'Waiting on their answer', text: `They have ${RESPONSE_DAYS} days from receipt. Expect a letter or an email by ${due ? due.toLocaleDateString('en-US', { month: 'long', day: 'numeric' }) : 'the due date'}. When it arrives, record what they said here.` };
    if (!d.outcome && overdue) return { code: 'overdue', title: 'Their time is up', text: 'No answer inside the window. Record "no response" and Maren drafts a complaint to the CFPB, which the bureau must answer.' };
    if (d.outcome === 'verified') return { code: 'escalate', title: 'They said "verified". You have two more moves', text: 'Ask the bureau how they verified it (they owe you that within 15 days), and dispute directly with the creditor. Maren drafts both.' };
    if (d.outcome === 'no_response') return { code: 'escalate', title: 'No response. File a CFPB complaint', text: 'The CFPB forwards your complaint to the company and tracks their answer. Maren drafted the text; you paste it in.' };
  }
  return { code: 'wait', title: 'In progress', text: 'Check back after the next mail day.' };
}

// ---------------------------------------------------------------------------
// Letters: edit, sign, mark sent
// ---------------------------------------------------------------------------
async function ownedLetter(db, member, letterId) {
  const { rows } = await db(`SELECT l.*, d.status AS dispute_status FROM dispute_letters l JOIN disputes d ON d.id = l.dispute_id WHERE l.id = $1 AND l.member_id = $2 AND l.deleted_at IS NULL FOR UPDATE`, [letterId, member.id]);
  if (!rows[0]) throw new NotFoundError('Letter not found');
  return rows[0];
}

export async function editLetter(member, letterId, { body }, actor) {
  if (!body || body.trim().length < 80) throw new ValidationError('The letter is too short to send');
  if (body.length > 12000) throw new ValidationError('The letter is too long');
  return withTransaction(async (db) => {
    const l = await ownedLetter(db, member, letterId);
    if (l.status === 'sent') throw new ConflictError('This letter was already sent', 'letter_sent');
    await db(`UPDATE dispute_letters SET body = $2, status = 'draft', signed_name = NULL, approved_at = NULL WHERE id = $1`, [letterId, body]);
    await audit({ actorUserId: actor.userId, actorRole: actor.role, action: 'dispute.letter_edited', entityType: 'dispute_letter', entityId: letterId, ...actor.reqMeta }, db);
    return getDispute(member, l.dispute_id, db);
  });
}

export async function approveLetter(member, letterId, { signedName }, actor) {
  if (!signedName || signedName.trim().length < 3) throw new ValidationError('Type your full name to sign');
  return withTransaction(async (db) => {
    const l = await ownedLetter(db, member, letterId);
    if (l.status === 'sent') throw new ConflictError('This letter was already sent', 'letter_sent');
    const head = await letterhead(member, db);
    if (!head.complete && l.kind !== 'cfpb_complaint') throw new ValidationError('Add your mailing address and date of birth first');
    await db(`UPDATE dispute_letters SET status = 'approved', signed_name = $2, approved_at = now() WHERE id = $1`, [letterId, signedName.trim()]);
    await db(`INSERT INTO dispute_events (dispute_id, kind, text) VALUES ($1, 'letter_approved', $2)`, [l.dispute_id, `You signed the letter to ${l.recipient_name}.`]);
    await audit({ actorUserId: actor.userId, actorRole: actor.role, action: 'dispute.letter_signed', entityType: 'dispute_letter', entityId: letterId, metadata: { signedName: signedName.trim() }, ...actor.reqMeta }, db);
    return getDispute(member, l.dispute_id, db);
  });
}

export async function markSent(member, letterId, { method, sentOn, tracking }, actor) {
  const methods = ['certified_mail', 'mail', 'online', 'fax'];
  if (!methods.includes(method)) throw new ValidationError('Pick how you sent it');
  const day = sentOn ? new Date(`${String(sentOn).slice(0, 10)}T12:00:00Z`) : new Date();
  if (Number.isNaN(day.getTime()) || day > new Date(Date.now() + 86400000)) throw new ValidationError('Sent date is not valid');
  return withTransaction(async (db) => {
    const l = await ownedLetter(db, member, letterId);
    if (l.status === 'draft') throw new ConflictError('Sign the letter before marking it sent', 'letter_unsigned');
    if (l.status === 'sent') throw new ConflictError('Already marked sent', 'letter_sent');
    const sentDate = day.toISOString().slice(0, 10);
    await db(`UPDATE dispute_letters SET status = 'sent', sent_at = $2, sent_method = $3, tracking = $4 WHERE id = $1`, [letterId, sentDate, method, tracking?.trim() || null]);

    const waitDays = RESPONSE_DAYS + (method === 'online' ? 0 : MAIL_DAYS);
    const nextStatus = l.kind === 'bureau_dispute' ? 'filed' : 'investigating';
    // First send opens the clock; later sends never shorten it.
    await db(
      `UPDATE disputes SET status = CASE WHEN status IN ('draft','filed','investigating') THEN $2 ELSE status END,
                           filed_at = CASE WHEN status = 'draft' THEN now() ELSE filed_at END,
                           due_at = GREATEST(COALESCE(due_at, $3::date), $3::date),
                           outcome = CASE WHEN $4 > 1 THEN NULL ELSE outcome END, outcome_at = CASE WHEN $4 > 1 THEN NULL ELSE outcome_at END,
                           method = $5
        WHERE id = $1`,
      [l.dispute_id, nextStatus, new Date(day.getTime() + waitDays * 86400000).toISOString().slice(0, 10), l.round, method === 'online' ? 'online' : 'mail'],
    );
    await db(`INSERT INTO dispute_events (dispute_id, kind, text, meta) VALUES ($1, 'letter_sent', $2, $3)`,
      [l.dispute_id, `You sent the letter to ${l.recipient_name} by ${method.replace('_', ' ')}${tracking ? ` (tracking ${tracking.trim()})` : ''}.`, JSON.stringify({ letterId, method, sentOn: sentDate })]);
    await audit({ actorUserId: actor.userId, actorRole: actor.role, action: 'dispute.letter_sent', entityType: 'dispute_letter', entityId: letterId, metadata: { method, sentOn: sentDate }, ...actor.reqMeta }, db);
    return getDispute(member, l.dispute_id, db);
  });
}

// ---------------------------------------------------------------------------
// Outcome and next round
// ---------------------------------------------------------------------------
export async function recordOutcome(member, disputeId, { outcome, note }, actor) {
  if (!['deleted', 'updated', 'verified', 'no_response'].includes(outcome)) throw new ValidationError('Pick what they said');
  return withTransaction(async (db) => {
    const { rows } = await db(`SELECT id, status, round FROM disputes WHERE id = $1 AND member_id = $2 AND deleted_at IS NULL FOR UPDATE`, [disputeId, member.id]);
    const d = rows[0];
    if (!d) throw new NotFoundError('Dispute not found');
    if (!['filed', 'investigating'].includes(d.status)) throw new ConflictError('Send a letter before recording an answer', 'not_sent');
    const closes = outcome === 'deleted' || outcome === 'updated';
    await db(`UPDATE disputes SET outcome = $2, outcome_at = now(), outcome_note = $3, status = CASE WHEN $4 THEN 'resolved' ELSE 'investigating' END WHERE id = $1`, [disputeId, outcome, note?.trim() || null, closes]);
    const label = { deleted: 'removed the item', updated: 'corrected the item', verified: 'said the item is verified', no_response: 'did not answer in time' }[outcome];
    await db(`INSERT INTO dispute_events (dispute_id, kind, text, meta) VALUES ($1, 'response', $2, $3)`, [disputeId, `You recorded that they ${label}.${note ? ` Note: ${note.trim()}` : ''}`, JSON.stringify({ outcome })]);
    await audit({ actorUserId: actor.userId, actorRole: actor.role, action: 'dispute.outcome_recorded', entityType: 'dispute', entityId: disputeId, metadata: { outcome }, ...actor.reqMeta }, db);
    return getDispute(member, disputeId, db);
  });
}

/** Maren drafts the next round. kind: mov_request | furnisher_direct | debt_validation | cfpb_complaint */
export async function nextRound(member, disputeId, { kind, bureaus, recipientAddress }, actor) {
  const kinds = ['mov_request', 'furnisher_direct', 'debt_validation', 'cfpb_complaint'];
  if (!kinds.includes(kind)) throw new ValidationError('Pick the next step from the list');
  return withTransaction(async (db) => {
    const { rows } = await db(
      `SELECT d.*, ci.creditor, ci.type, ci.balance FROM disputes d JOIN credit_items ci ON ci.id = d.credit_item_id
        WHERE d.id = $1 AND d.member_id = $2 AND d.deleted_at IS NULL FOR UPDATE`,
      [disputeId, member.id],
    );
    const d = rows[0];
    if (!d) throw new NotFoundError('Dispute not found');
    if (!['filed', 'investigating'].includes(d.status)) throw new ConflictError('This dispute is not open', 'not_open');
    if (kind === 'mov_request' && d.outcome !== 'verified') throw new ConflictError('A method-of-verification request follows a "verified" answer', 'mov_needs_verified');
    if (kind === 'cfpb_complaint' && !['verified', 'no_response'].includes(d.outcome ?? '')) throw new ConflictError('File with the CFPB after they answer "verified" or miss the deadline', 'cfpb_needs_outcome');
    if (d.round >= 6) throw new ConflictError('This dispute has reached its last round', 'max_rounds');

    const { rows: prior } = await db(`SELECT recipient_key, sent_at::text AS sent_at, recipient_name, kind FROM dispute_letters WHERE dispute_id = $1 AND status = 'sent' AND deleted_at IS NULL ORDER BY sent_at`, [disputeId]);
    const { rows: events } = await db(`SELECT text, created_at FROM dispute_events WHERE dispute_id = $1 AND kind IN ('letter_sent','response') ORDER BY created_at`, [disputeId]);
    const head = await letterhead(member, db);
    const item = { creditor: d.creditor, type: d.type, balance: d.balance };
    const round = d.round + 1;
    const targets = (bureaus?.length ? bureaus : d.bureaus).filter((b) => BUREAU_KEYS.includes(b));
    const made = [];
    if (kind === 'mov_request') {
      for (const b of targets) {
        const p = prior.find((x) => x.recipient_key === b && x.kind === 'bureau_dispute');
        made.push(movRequest({ member: head, item, bureauKey: b, priorSentAt: p?.sent_at }));
      }
    } else if (kind === 'furnisher_direct') {
      made.push(furnisherDirect({ member: head, item, reasonCode: d.reason_code, details: d.details, furnisherAddress: recipientAddress }));
    } else if (kind === 'debt_validation') {
      made.push(debtValidation({ member: head, item, collectorAddress: recipientAddress }));
    } else {
      const history = events.map((e) => `${new Date(e.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}: ${e.text}`);
      for (const b of targets.length ? targets : [null]) made.push(cfpbComplaint({ member: head, item, bureauKey: b, history }));
    }
    if (made.length === 0) throw new ValidationError('Nothing to draft for that choice');
    for (const l of made) await insertLetter(db, disputeId, member.id, round, l);
    await db(`UPDATE disputes SET round = $2, status = 'investigating' WHERE id = $1`, [disputeId, round]);
    const kindLabel = { mov_request: 'method-of-verification request', furnisher_direct: 'direct dispute to the creditor', debt_validation: 'debt validation request', cfpb_complaint: 'CFPB complaint' }[kind];
    await db(`INSERT INTO dispute_events (dispute_id, kind, text, meta) VALUES ($1, 'next_round', $2, $3)`, [disputeId, `Round ${round}: ${COUNSELOR.name} drafted ${made.length} ${kindLabel}${made.length > 1 ? 's' : ''}.`, JSON.stringify({ kind, round })]);
    await audit({ actorUserId: actor.userId, actorRole: actor.role, action: 'dispute.next_round', entityType: 'dispute', entityId: disputeId, metadata: { kind, round }, ...actor.reqMeta }, db);
    return getDispute(member, disputeId, db);
  });
}

export async function getCaseByLetter(member, letterId) {
  const { rows } = await query(`SELECT dispute_id FROM dispute_letters WHERE id = $1 AND member_id = $2 AND deleted_at IS NULL`, [letterId, member.id]);
  if (!rows[0]) throw new NotFoundError('Letter not found');
  return getDispute(member, rows[0].dispute_id);
}

/** Tracker list with next step for each open case. */
export async function listCases(member) {
  const { rows } = await query(
    `SELECT d.*, d.due_at::text AS due_at, ci.creditor, ci.type FROM disputes d JOIN credit_items ci ON ci.id = d.credit_item_id
      WHERE d.member_id = $1 AND d.deleted_at IS NULL ORDER BY (d.status IN ('draft','filed','investigating')) DESC, d.filed_at DESC`,
    [member.id],
  );
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const { rows: letters } = await query(`SELECT dispute_id, round, status, kind FROM dispute_letters WHERE dispute_id = ANY($1) AND deleted_at IS NULL`, [ids]);
  const head = await letterhead(member);
  return rows.map((d) => ({
    id: d.id, status: d.status, round: d.round, creditor: d.creditor, type: d.type, reasonLabel: REASONS[d.reason_code]?.label ?? d.reason_code ?? 'Dispute',
    filedAt: d.filed_at, dueAt: d.due_at, dayCount: liveDays(d), outcome: d.outcome, bureaus: d.bureaus,
    next: nextStep(d, letters.filter((l) => l.dispute_id === d.id), head),
  }));
}

/** Housekeeping: day counter runs from the first send. */
export async function tickDisputeClocks() {
  await query(`UPDATE disputes SET day_count = GREATEST(0, (CURRENT_DATE - filed_at::date))::int WHERE status IN ('filed','investigating') AND deleted_at IS NULL`);
}

export const REASON_LIST = Object.entries(REASONS).map(([code, r]) => ({ code, label: r.label, evidence: r.evidence }));
export const BUREAU_LIST = Object.entries(BUREAUS).map(([key, b]) => ({ key, name: b.name, online: b.online, phone: b.phone }));
