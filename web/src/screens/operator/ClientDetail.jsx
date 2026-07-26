import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { operator } from '../../api/client.js';

// Client detail (spec §5.2): full plan view, all six tracks, message history, team.
export default function ClientDetail() {
  const { memberId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    operator.client(memberId).then(setData).catch((e) => setError(e.message));
  }, [memberId]);

  if (error) return <div className="error">{error}</div>;
  if (!data) return <div className="loading">Loading…</div>;

  return (
    <div>
      <button className="btn secondary back" onClick={() => navigate('/')}>← Clients</button>
      <h1 className="h1">{data.member.email}</h1>
      <p className="sub">Day {data.plan.planDay} · plan {data.plan.status} · tier {data.member.membership_tier}</p>

      <div className="op-grid">
        <section className="card">
          <div className="h2" style={{ marginTop: 0 }}>Six tracks</div>
          {data.plan.tracks.map((t) => (
            <div className="track" key={t.track_type}>
              <div className="track-top"><span className="track-name">{t.track_type}</span><span className="track-pct">{t.progress_pct}%</span></div>
              <div className="bar"><span style={{ width: `${t.progress_pct}%` }} /></div>
            </div>
          ))}
        </section>

        <section className="card">
          <div className="h2" style={{ marginTop: 0 }}>Team ({data.team.length})</div>
          {data.team.map((m) => (
            <div className="op-row" key={m.assignmentId}>
              <span>{m.title || m.role}</span>
              <span className="item-meta">{m.role}{m.avgResponsiveness != null ? ` · ★${m.avgResponsiveness}` : ''}</span>
            </div>
          ))}
          {data.team.length === 0 && <div className="muted-card">No team assigned.</div>}
        </section>

        <section className="card">
          <div className="h2" style={{ marginTop: 0 }}>Disputes ({data.disputes.length})</div>
          {data.disputes.map((d) => (
            <div className="op-row" key={d.id}><span>{d.creditor}</span><span className={`badge status-${d.status}`}>{d.status} · day {d.day_count}</span></div>
          ))}
          {data.disputes.length === 0 && <div className="muted-card">None.</div>}
        </section>

        <section className="card">
          <div className="h2" style={{ marginTop: 0 }}>Recent messages</div>
          {data.messages.slice(-8).map((m) => (
            <div className="op-msg" key={m.id}>{m.body}</div>
          ))}
          {data.messages.length === 0 && <div className="muted-card">No messages.</div>}
        </section>
      </div>
    </div>
  );
}
