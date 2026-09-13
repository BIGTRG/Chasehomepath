import { query, withTransaction } from '../db/pool.js';
import { audit } from '../lib/audit.js';
import { sendMail } from '../lib/mailer.js';
import { ValidationError, NotFoundError } from '../lib/errors.js';
import { businessParts, businessDate, BUSINESS_TZ } from '../lib/businessTime.js';
import { publicLesson, grade } from '../education/lessons.js';
import { getLearnForMember } from './education.service.js';

/**
 * Scheduled training (Deon, 2026-09-12): "schedule the trainings for them, don't let
 * them do it anytime, make sure their schedule is approved by them and alert them,
 * keep it short, make sure they pass."
 *
 * propose -> approve -> (alert at start) -> lesson + 3-question check -> pass marks the
 * module done; fail keeps it open and re-books the same slot one week out.
 */

const DAY_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Propose one lesson per chosen weekday at the chosen time, starting tomorrow. */
export function proposeSlots({ now = new Date(), days = ['Mon', 'Wed', 'Fri'], hour = 19, minute = 0, count }) {
  const wanted = new Set(days.map((d) => DAY_INDEX[d]).filter((d) => d != null));
  if (wanted.size === 0) throw new ValidationError('Pick at least one day');
  if (hour < 6 || hour > 22) throw new ValidationError('Pick a time between 6:00 AM and 10:00 PM');
  const out = [];
  for (let i = 1; out.length < count && i < 120; i++) {
    const day = new Date(now.getTime() + i * 86400000);
    const p = businessParts(day);
    if (!wanted.has(DAY_INDEX[p.weekday])) continue;
    const s = businessDate(p.y, p.m, p.d, hour, minute);
    if (s > now) out.push(s.toISOString());
  }
  return out;
}

/** Modules still to pass, in curriculum order (available first, then locked "before" ones). */
async function pendingModules(memberId) {
  const learn = await getLearnForMember(memberId);
  const all = [...learn.groups.before, ...learn.groups.during, ...learn.groups.after];
  return all.filter((m) => m.status !== 'done');
}

export async function proposeSchedule(member, { days, hour, minute = 0 }, actor) {
  const mods = await pendingModules(member.id);
  if (mods.length === 0) return { sessions: [], pref: { days, hour, minute } };
  const slots = proposeSlots({ days, hour, minute, count: mods.length });
  return withTransaction(async (db) => {
    await db(`UPDATE training_sessions SET deleted_at = now() WHERE member_id = $1 AND status = 'proposed' AND deleted_at IS NULL`, [member.id]);
    await db(`UPDATE members SET training_pref = $2 WHERE id = $1`, [member.id, JSON.stringify({ days, hour, minute, tz: BUSINESS_TZ })]);
    const sessions = [];
    for (let i = 0; i < mods.length; i++) {
      const { rows } = await db(
        `INSERT INTO training_sessions (member_id, module_id, scheduled_at) VALUES ($1, $2, $3) RETURNING id, module_id, scheduled_at, status`,
        [member.id, mods[i].moduleId, slots[i]],
      );
      sessions.push({ ...rows[0], title: mods[i].title, durationMin: mods[i].durationMin });
    }
    await audit({ actorUserId: actor.userId, actorRole: actor.role, action: 'training.schedule_proposed', entityType: 'member', entityId: member.id, metadata: { count: sessions.length, days, hour }, ...actor.reqMeta }, db);
    return { sessions: sessions.map(shape), pref: { days, hour, minute } };
  });
}

export async function approveSchedule(member, actor) {
  const { rows } = await query(
    `UPDATE training_sessions SET status = 'approved', approved_at = now()
      WHERE member_id = $1 AND status = 'proposed' AND deleted_at IS NULL RETURNING id`,
    [member.id],
  );
  if (rows.length === 0) throw new ValidationError('Nothing to approve; propose a schedule first');
  await audit({ actorUserId: actor.userId, actorRole: actor.role, action: 'training.schedule_approved', entityType: 'member', entityId: member.id, metadata: { count: rows.length }, ...actor.reqMeta });
  return mySchedule(member);
}

export async function mySchedule(member) {
  const { rows } = await query(
    `SELECT ts.id, ts.module_id, ts.scheduled_at, ts.status, ts.attempts, ts.last_score, m.title, m.duration_min
       FROM training_sessions ts JOIN modules m ON m.id = ts.module_id
      WHERE ts.member_id = $1 AND ts.deleted_at IS NULL
      ORDER BY ts.scheduled_at`,
    [member.id],
  );
  const { rows: pref } = await query(`SELECT training_pref FROM members WHERE id = $1`, [member.id]);
  const now = Date.now();
  const sessions = rows.map((r) => shape({ ...r, durationMin: r.duration_min }));
  const next = sessions.find((s) => ['approved', 'failed'].includes(s.status) && new Date(s.scheduledAt).getTime() > now - 3 * 3600e3);
  return { sessions, next: next ?? null, pref: pref[0]?.training_pref ?? null };
}

function shape(r) {
  return { id: r.id, moduleId: r.module_id, title: r.title, durationMin: r.durationMin ?? r.duration_min, scheduledAt: r.scheduled_at, status: r.status, attempts: r.attempts ?? 0, lastScore: r.last_score ?? null };
}

/** A lesson opens in its window: 15 minutes before the slot until 3 hours after. Passed lessons stay readable. */
function windowOpen(scheduledAt, now = new Date()) {
  const t = new Date(scheduledAt).getTime();
  return now.getTime() >= t - 15 * 60e3 && now.getTime() <= t + 3 * 3600e3;
}

export async function getLesson(member, moduleId, { now = new Date() } = {}) {
  const { rows } = await query(`SELECT id, title, duration_min, content_ref FROM modules WHERE id = $1 AND deleted_at IS NULL`, [moduleId]);
  const mod = rows[0];
  if (!mod) throw new NotFoundError('Module not found');
  const { rows: sess } = await query(
    `SELECT id, scheduled_at, status, attempts FROM training_sessions WHERE member_id = $1 AND module_id = $2 AND deleted_at IS NULL ORDER BY scheduled_at`,
    [member.id, moduleId],
  );
  const live = (x) => ['approved', 'failed'].includes(x.status);
  // Prefer a session whose window is open now, then the next upcoming one, then the latest.
  const s = sess.find((x) => live(x) && windowOpen(x.scheduled_at, now))
    ?? sess.find((x) => ['approved', 'proposed'].includes(x.status) && new Date(x.scheduled_at) > now)
    ?? sess[sess.length - 1] ?? null;
  const { rows: asg } = await query(`SELECT status FROM module_assignments WHERE member_id = $1 AND module_id = $2 AND deleted_at IS NULL`, [member.id, moduleId]);
  const done = asg[0]?.status === 'done';
  const open = done || (s && ['approved', 'failed'].includes(s.status) && windowOpen(s.scheduled_at, now));
  const lesson = publicLesson(mod.content_ref);
  return {
    module: { id: mod.id, title: mod.title, durationMin: mod.duration_min },
    session: s ? { id: s.id, scheduledAt: s.scheduled_at, status: s.status, attempts: s.attempts } : null,
    open: Boolean(open),
    done,
    reason: open ? null : !s ? 'Not on your schedule yet' : s.status === 'proposed' ? 'Approve your schedule first' : `Opens 15 minutes before ${new Date(s.scheduled_at).toLocaleString('en-US', { timeZone: BUSINESS_TZ, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`,
    lesson: open ? lesson : null,
  };
}

/** Submit the check. Pass marks the module done (via module_assignments); fail re-books one week out. */
export async function submitCheck(member, moduleId, { answers }, actor, { now = new Date() } = {}) {
  const info = await getLesson(member, moduleId, { now });
  if (!info.open) throw new ValidationError(info.reason);
  if (info.done) throw new ValidationError('Already passed');
  const { rows } = await query(`SELECT content_ref FROM modules WHERE id = $1`, [moduleId]);
  const result = grade(rows[0].content_ref, answers);
  return withTransaction(async (db) => {
    if (result.passed) {
      await db(`UPDATE training_sessions SET status = 'passed', passed_at = now(), attempts = attempts + 1, last_score = $2 WHERE id = $1`, [info.session.id, result.score]);
      await db(`UPDATE module_assignments SET status = 'done', completed_at = now() WHERE member_id = $1 AND module_id = $2 AND deleted_at IS NULL`, [member.id, moduleId]);
    } else {
      const retry = new Date(new Date(info.session.scheduledAt).getTime() + 7 * 86400e3).toISOString();
      await db(`UPDATE training_sessions SET status = 'failed', attempts = attempts + 1, last_score = $2 WHERE id = $1`, [info.session.id, result.score]);
      await db(`INSERT INTO training_sessions (member_id, module_id, scheduled_at, status, approved_at) VALUES ($1, $2, $3, 'approved', now())`, [member.id, moduleId, retry]);
    }
    await audit({ actorUserId: actor.userId, actorRole: actor.role, action: result.passed ? 'training.passed' : 'training.failed', entityType: 'training_session', entityId: info.session.id, metadata: { moduleId, score: result.score, total: result.total }, ...actor.reqMeta }, db);
    return result;
  });
}

/**
 * Alerts: sessions starting within the next 15 minutes that have not been alerted.
 * Sends an email (SMS lands when the messaging adapter is wired) and stamps alerted_at.
 * Also marks approved sessions more than 3 hours past as missed and re-books them.
 */
export async function runAlerts({ now = new Date() } = {}) {
  const { rows: due } = await query(
    `SELECT ts.id, ts.scheduled_at, m.title, u.email, u.name
       FROM training_sessions ts JOIN modules m ON m.id = ts.module_id
       JOIN members mem ON mem.id = ts.member_id JOIN users u ON u.id = mem.user_id
      WHERE ts.status = 'approved' AND ts.alerted_at IS NULL AND ts.deleted_at IS NULL
        AND ts.scheduled_at BETWEEN $1 AND $2`,
    [now.toISOString(), new Date(now.getTime() + 15 * 60e3).toISOString()],
  );
  for (const s of due) {
    const when = new Date(s.scheduled_at).toLocaleTimeString('en-US', { timeZone: BUSINESS_TZ, hour: 'numeric', minute: '2-digit' });
    await sendMail({ to: s.email, subject: `Your lesson starts at ${when}: ${s.title}`, text: `${s.name ? s.name.split(' ')[0] + ', ' : ''}your HomePath lesson "${s.title}" starts at ${when}. Open the app, Learn tab. It is short, and it ends with a three-question check.` });
    await query(`UPDATE training_sessions SET alerted_at = now() WHERE id = $1`, [s.id]);
  }
  const { rows: missed } = await query(
    `UPDATE training_sessions SET status = 'missed'
      WHERE status = 'approved' AND deleted_at IS NULL AND scheduled_at < $1 RETURNING id, member_id, module_id, scheduled_at`,
    [new Date(now.getTime() - 3 * 3600e3).toISOString()],
  );
  for (const m of missed) {
    const retry = new Date(new Date(m.scheduled_at).getTime() + 7 * 86400e3).toISOString();
    await query(`INSERT INTO training_sessions (member_id, module_id, scheduled_at, status, approved_at) VALUES ($1, $2, $3, 'approved', now())`, [m.member_id, m.module_id, retry]);
  }
  return { alerted: due.length, missed: missed.length };
}
