import { query } from '../db/pool.js';
import { getPlanForMember } from './plan.service.js';
import { getCreditOverview, hasCompletedConsultation } from './credit.service.js';
import { checkCopy } from '../compliance/copyGate.js';
import { COUNSELOR } from '../lib/counselor.js';

/**
 * Counselor (Maren) plan review (Deon, 2026-09-12): after the first consultation and
 * payment, the agent walks the member through their plan and each credit item.
 *
 * Steps are generated from the member's OWN data with deterministic templates and
 * passed through the copy gate, so the walkthrough can never promise an outcome.
 * The member can ask free-form questions at any step via POST /api/agent/ask.
 */

const TRACK_COPY = {
  credit: 'Your credit track. We go item by item. You decide what to question; we help you prepare it.',
  budget: 'Your budget track. Where the money goes now, and the version that gets you to closing.',
  savings: 'Your savings track. Down payment, closing costs, and a cushion so the first repair is not a crisis.',
  education: 'Your education track. Short lessons unlocked as your plan needs them.',
  readiness: 'Your readiness track. Documents, employment history, and the file a lender will ask for.',
  timeline: 'Your timeline track. The order things happen in and what has to be true before day 90.',
};

const money = (v) => (v == null ? null : `$${Number(v).toLocaleString('en-US')}`);

export async function buildPlanReview(member) {
  const [plan, credit, consultDone, sub, intake] = await Promise.all([
    getPlanForMember(member.id),
    getCreditOverview(member),
    hasCompletedConsultation(member.id),
    query(`SELECT s.plan_code, p.name, p.target_months FROM subscriptions s JOIN billing_plans p ON p.code = s.plan_code
            WHERE s.member_id = $1 AND s.status <> 'cancelled' AND s.deleted_at IS NULL LIMIT 1`, [member.id]).then((r) => r.rows[0] ?? null),
    query(`SELECT household_income, target_area FROM intake_profiles WHERE member_id = $1`, [member.id]).then((r) => r.rows[0] ?? null),
  ]);

  const steps = [];
  const months = sub?.target_months ?? 12;
  const targetLabel = new Date(Date.now() + months * 30.4 * 864e5).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  steps.push({
    key: 'welcome', title: 'Your plan, in plain terms', screen: '/',
    say: `Welcome. I am ${COUNSELOR.name}, ${COUNSELOR.title}. ${consultDone ? 'Your specialist and I built this plan from your first meeting' : 'This plan comes from your intake'}${intake?.target_area ? `, aimed at ${intake.target_area}` : ''}. ` +
      `You are on the ${sub?.name ?? 'HomePath'} pace with a ${months}-month target, which points at ${targetLabel}. Nothing here is a promise; it is the work, in order.`,
  });

  steps.push({
    key: 'day', title: `Day ${plan.planDay} of your plan`, screen: '/',
    say: `Today is day ${plan.planDay}. Nothing gets placed before day 90; that window is for the file work. Overall progress is ${plan.overallProgressPct ?? 0} percent. Six tracks run at once, and each has its own next step.`,
  });

  for (const t of plan.tracks) {
    const ms = plan.milestones.filter((m) => m.track_type === t.track_type);
    const next = ms.find((m) => !m.completed_at);
    steps.push({
      key: `track:${t.track_type}`, title: TRACK_COPY[t.track_type].split('.')[0], screen: t.track_type === 'credit' ? '/credit' : t.track_type === 'budget' || t.track_type === 'savings' ? '/money' : t.track_type === 'education' ? '/learn' : '/',
      say: `${TRACK_COPY[t.track_type]} Status: ${t.status.replace('_', ' ')}, ${t.progress_pct} percent. ${next ? `Next milestone: ${next.label}${next.due_day != null ? `, due around day ${next.due_day}` : ''}.` : ms.length ? 'Every milestone on this track is done.' : 'Milestones appear as your specialist sets them.'}`,
    });
  }

  if (credit.hasReport) {
    steps.push({
      key: 'credit:overview', title: 'Your credit file', screen: '/credit',
      say: `We reviewed ${credit.disputable.length + credit.accurate.length} items. ${credit.disputable.length} look inaccurate or incomplete and are yours to question if you choose. ${credit.accurate.length} report correctly; disputing those will not help, but paying them down can.` +
        (credit.score?.withheld ? ' Your score unlocks after your first consultation is marked complete.' : credit.score?.value ? ` Your current score on file is ${credit.score.value}.` : ''),
    });
    for (const item of credit.disputable) {
      steps.push({
        key: `credit:${item.id}`, title: `${item.creditor}`, screen: `/credit/items/${item.id}`, itemId: item.id,
        say: `${item.creditor}, ${item.type}. Reported balance ${money(item.balance) ?? 'not listed'}${item.member_recorded_balance != null ? `, your records show ${money(item.member_recorded_balance)}` : ''}. ${item.guidance_text ?? ''} ${item.has_open_dispute ? 'You already have a dispute in progress on this one.' : 'If you want to question it, open the item and choose to dispute. You send it; we help you prepare it.'}`.trim(),
      });
    }
    if (credit.accurate.length) {
      steps.push({
        key: 'credit:accurate', title: 'Items that report correctly', screen: '/credit',
        say: `${credit.accurate.map((i) => i.creditor).join(', ')} report correctly. The move here is paying down the highest-utilization cards first, which your budget track is built around.`,
      });
    }
  } else {
    steps.push({ key: 'credit:none', title: 'Your credit file', screen: '/credit', say: 'We have not pulled your credit yet. Your specialist will do that with your written authorization from the qualify screen.' });
  }

  steps.push({
    key: 'counseling', title: 'When you want a person', screen: '/counseling',
    say: 'Any time you want to sit with a specialist, book a 45-minute 1:1 or join a group session on a topic like food spending, saving, or budget basics. Sessions are separate from your plan fee and you can book as often as your plan calls for.',
  });
  steps.push({
    key: 'done', title: 'That is your plan', screen: '/',
    say: 'That is the whole plan. Ask me anything about it, any time, from the Maren tab. Questions about rates, loan terms, or legal matters go to your licensed team, and I will hand those off.',
  });

  // Copy gate every line; replace anything promissory with a neutral sentence.
  for (const s of steps) {
    if (!checkCopy(s.say).ok) s.say = `${s.title}. Open this screen for the details, and ask your specialist about anything specific to your situation.`;
  }
  return {
    ready: Boolean(sub),
    consultationDone: consultDone,
    plan: sub ? { code: sub.plan_code, name: sub.name, targetMonths: sub.target_months } : null,
    steps,
  };
}
