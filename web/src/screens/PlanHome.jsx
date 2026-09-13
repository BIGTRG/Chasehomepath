import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { plan as planApi, billing as billingApi } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.jsx';
import ScreenTop from '../components/ScreenTop.jsx';

// Walkthrough screen 6: leads with the day count, not a score. Track cards with
// status pills; the 90-day rule sits in the orange note. (spec §4.7, §8)

const TRACK_META = {
  credit: { bar: '', label: 'Credit' },
  budget: { bar: 'w', label: 'Budget' },
  savings: { bar: 'b', label: 'Savings' },
  education: { bar: 'g', label: 'Education' },
  readiness: { bar: 'g', label: 'Readiness' },
  timeline: { bar: 'b', label: 'Timeline' },
};

const fmtDate = (d) =>
  new Date(d).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });

// No name column server-side (privacy by design) — derive initials from the email
// local part: "marcus.t@…" → MT.
const initials = (email) => {
  const parts = String(email || '').split('@')[0].split(/[._\-+]/).filter(Boolean);
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : (parts[0] || 'ME').slice(0, 2)).toUpperCase();
};

export default function PlanHome() {
  const { user, logout } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [bill, setBill] = useState(undefined);

  async function load() {
    try {
      const { plan } = await planApi.mine();
      setData(plan);
    } catch (err) {
      setError(err.message || 'Could not load your plan');
    }
  }

  useEffect(() => {
    load();
    billingApi.me().then(setBill).catch(() => setBill(null));
  }, []);

  async function toggleMilestone(m) {
    // Member-initiated action; server records the actor.
    await planApi.setMilestone(m.id, !m.completed_at);
    load();
  }

  if (error) return <div className="content"><div className="error">{error}</div></div>;
  if (!data) return <div className="loading">Loading your plan…</div>;

  const { placement } = data;
  const totalDays = data.targetDate
    ? Math.max(1, Math.round((new Date(data.targetDate) - new Date(new Date() - data.planDay * 86400000)) / 86400000))
    : 180;

  return (
    <div className="content">
      <ScreenTop
        title="Your plan"
        sub={data.targetDate ? `Target: ${fmtDate(data.targetDate)}` : 'Your path to the keys'}
        right={<span className="av">{initials(user?.email)}</span>}
      />

      {/* Segmented progress strip — one segment per track */}
      <div className="steps">
        {data.tracks.map((t) => (
          <b key={t.track_type} className={t.progress_pct >= 100 ? 'on' : t.progress_pct > 0 ? 'cur' : ''} />
        ))}
      </div>

      {/* Day count + 90-day rule, in the orange note (walkthrough copy) */}
      <div className="note">
        {placement.eligible
          ? `Day ${data.planDay} of ${totalDays}. You've passed the ${placement.minDay}-day minimum — you can be considered for placement.`
          : `Day ${data.planDay} of ${totalDays}. Nothing gets placed before day ${placement.minDay} — that time is doing real work on your file.`}
      </div>

      {/* Journey: choose a pace after the first consultation, then the plan walkthrough with Maren */}
      {bill !== undefined && !bill?.subscription && (
        <Link to="/plans" className="card item-card hl">
          <div className="item-top"><span className="item-creditor">Choose your pace</span><span className="chev">›</span></div>
          <div className="item-meta">Steady, Focused, or Express. Monthly, cancel anytime. Unlocks your full plan and the walkthrough with Maren.</div>
        </Link>
      )}
      {bill?.subscription && data.planDay <= 7 && (
        <Link to="/plan-review" className="card item-card gl">
          <div className="item-top"><span className="item-creditor">Walk through your plan</span><span className="chev">›</span></div>
          <div className="item-meta">Maren goes screen by screen through your plan and each credit item.</div>
        </Link>
      )}
      {bill?.sessions?.some((x) => x.status === 'booked') && (() => {
        const next = bill.sessions.filter((x) => x.status === 'booked').sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt))[0];
        return (
          <Link to={next.roomCode ? `/meet/${next.roomCode}` : '/billing'} className="card item-card">
            <div className="item-top"><span className="item-creditor">Next session</span><span className="chev">›</span></div>
            <div className="item-meta">{new Date(next.scheduledAt).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}{next.format === 'group' ? `, ${next.groupTitle}` : ', 1:1 counseling'}. Tap to open the room.</div>
          </Link>
        );
      })()}

      {/* Track cards */}
      {data.tracks.map((t) => {
        const meta = TRACK_META[t.track_type] || { bar: '', label: t.track_type };
        const blocked = t.status === 'blocked';
        return (
          <Link key={t.track_type} to={trackLink(t.track_type)} className="card track-card">
            <div className="track-top">
              <span className="track-name">{meta.label}</span>
              <span className={`pill ${blocked ? 'w' : 'g'}`}>{blocked ? 'Look' : t.status === 'complete' ? 'Done' : 'On track'}</span>
            </div>
            <div className="track-sub">{t.progress_pct}% · {t.status.replace('_', ' ')}</div>
            <div className="bar"><span className={meta.bar} style={{ width: `${t.progress_pct}%` }} /></div>
          </Link>
        );
      })}

      <Link to="/marketplace" className="card item-card">
        <div className="item-top"><span className="item-creditor">Explore the marketplace</span><span className="chev">›</span></div>
        <div className="item-meta">Homes, lots, and build plans — priced with your assistance.</div>
      </Link>

      <Link to="/readiness" className="card item-card">
        <div className="item-top"><span className="item-creditor">Where you stand</span><span className="chev">›</span></div>
        <div className="item-meta">FHA, USDA, conventional: today's gaps and where you could be at 6, 9, and 12 months.</div>
      </Link>

      <Link to="/counseling" className="card item-card">
        <div className="item-top"><span className="item-creditor">Talk to a person</span><span className="chev">›</span></div>
        <div className="item-meta">1:1 or group counseling on food spending, saving, budgeting, and more. Book any time.</div>
      </Link>

      <Link to="/agent" className="card item-card">
        <div className="item-top"><span className="item-creditor">Ask Maren</span><span className="chev">›</span></div>
        <div className="item-meta">Your counselor, always on. Questions about your plan, credit, or money, any time.</div>
      </Link>

      {data.status === 'completed' && (
        <Link to="/home" className="card item-card gl">
          <div className="item-top"><span className="item-creditor">Homeowner mode</span><span className="chev">›</span></div>
          <div className="item-meta">Maintenance, escrow &amp; taxes, value, and refi alerts.</div>
        </Link>
      )}

      {/* Milestones */}
      {data.milestones.length > 0 && (
        <>
          <div className="lbl">Milestones</div>
          <div className="card">
            {data.milestones.map((m) => (
              <div className="milestone" key={m.id}>
                <button
                  className={`check ${m.completed_at ? 'done' : ''}`}
                  onClick={() => toggleMilestone(m)}
                  aria-label={m.completed_at ? 'Mark incomplete' : 'Mark complete'}
                >
                  {m.completed_at ? '✓' : ''}
                </button>
                <span className="ms-label">{m.label}</span>
                {m.due_day != null && <span className="ms-day">Day {m.due_day}</span>}
              </div>
            ))}
          </div>
        </>
      )}

      <Link to="/billing" className="btn outline" style={{ marginTop: 8 }}>Billing and receipts</Link>
      <button className="btn secondary" onClick={logout} style={{ marginTop: 8 }}>
        Sign out
      </button>
    </div>
  );
}

function trackLink(type) {
  if (type === 'credit') return '/credit';
  if (type === 'budget' || type === 'savings') return '/money';
  if (type === 'education') return '/learn';
  return '/';
}
