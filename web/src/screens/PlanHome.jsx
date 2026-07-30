import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { plan as planApi } from '../api/client.js';
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

      <Link to="/agent" className="card item-card">
        <div className="item-top"><span className="item-creditor">HomePath agent</span><span className="chev">›</span></div>
        <div className="item-meta">Always on. Questions about your plan, credit, or money — ask anytime.</div>
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
