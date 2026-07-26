import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { plan as planApi } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.jsx';
import TrackList from '../components/TrackList.jsx';

// Plan home (spec §4.7): leads with the DAY COUNT, not a score. Six-track progress.
// The 90-day minimum rule is shown visibly. No credit score appears here.
export default function PlanHome() {
  const { logout } = useAuth();
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

  return (
    <div className="content">
      <h1 className="h1">Your plan</h1>
      <p className="sub">Every day moves you closer to owning a home.</p>

      {/* Day count leads */}
      <div className="card daycount">
        <div className="num">{data.planDay}</div>
        <div className="label">Day of your plan</div>
        {data.targetDate && (
          <div className="target">Target move-in: {new Date(data.targetDate).toLocaleDateString()}</div>
        )}
      </div>

      {/* 90-day rule, visible */}
      <div className={`rule-banner ${placement.eligible ? 'ready' : ''}`}>
        <span className="dot" />
        <span>
          {placement.eligible
            ? `You've passed the ${placement.minDay}-day minimum and can be considered for placement.`
            : `Placement readiness opens at day ${placement.minDay}. ${placement.daysRemaining} day${placement.daysRemaining === 1 ? '' : 's'} to go.`}
        </span>
      </div>

      <TrackList tracks={data.tracks} />

      <Link to="/marketplace" className="card item-card">
        <div className="item-top">
          <span className="item-creditor">Explore the marketplace →</span>
        </div>
        <div className="item-meta">Homes, lots, and build plans — priced with your assistance.</div>
      </Link>

      <Link to="/agent" className="card item-card">
        <div className="item-top">
          <span className="item-creditor">Ask CHASE →</span>
        </div>
        <div className="item-meta">Questions about your plan, credit, or money? Ask anytime.</div>
      </Link>

      {data.status === 'completed' && (
        <Link to="/home" className="card item-card">
          <div className="item-top">
            <span className="item-creditor">Homeowner mode →</span>
          </div>
          <div className="item-meta">Maintenance, escrow &amp; taxes, value, and refi alerts.</div>
        </Link>
      )}

      {/* Milestones */}
      {data.milestones.length > 0 && (
        <div className="card">
          <div className="h2" style={{ marginTop: 0 }}>Milestones</div>
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
      )}

      <button className="btn secondary" onClick={logout} style={{ marginTop: 8 }}>
        Sign out
      </button>
    </div>
  );
}
