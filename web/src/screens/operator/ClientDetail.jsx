import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { operator, billing as billingApi } from '../../api/client.js';

const money = (c) => `$${(c / 100).toFixed(c % 100 ? 2 : 0)}`;
const fmt = (d) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

// Client detail (spec §5.2): full plan view, all six tracks, message history, team.
export default function ClientDetail() {
  const { memberId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [bill, setBill] = useState(null);
  const [ready, setReady] = useState(null);

  useEffect(() => {
    operator.client(memberId).then(setData).catch((e) => setError(e.message));
    billingApi.operatorMember(memberId).then(setBill).catch(() => setBill({ subscription: null, payments: [], sessions: [] }));
    billingApi.operatorReadiness(memberId).then(setReady).catch(() => setReady(false));
  }, [memberId]);

  async function mark(id, status) {
    await billingApi.markSession(id, status);
    setBill(await billingApi.operatorMember(memberId));
  }

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

        <section className="card">
          <div className="h2" style={{ marginTop: 0 }}>Readiness</div>
          {ready === null ? <div className="loading">Loading…</div> : ready === false ? <div className="muted-card">Not available.</div> : (
            <>
              <div className="kv"><span>Status</span><span className={`hbadge ${ready.today.readyNow ? 'green' : 'amber'}`}>{ready.today.readyNow ? 'lender-ready basics' : 'not ready'}</span></div>
              <div className="kv"><span>Score on file</span><span>{ready.inputs.creditScore ?? (ready.scoreWithheld ? 'withheld' : 'none')}</span></div>
              <div className="kv"><span>Income / DTI</span><span>{ready.inputs.annualIncome ? `$${Math.round(ready.inputs.annualIncome).toLocaleString()}` : 'n/a'}{ready.inputs.dti != null ? ` / ${Math.round(ready.inputs.dti * 100)}%` : ''}</span></div>
              <div className="kv"><span>Est. max price</span><span>{ready.today.estimatedMaxPrice ? `$${ready.today.estimatedMaxPrice.toLocaleString()}` : 'n/a'}</span></div>
              <div className="kv"><span>Recommended pace</span><span style={{ textTransform: 'capitalize' }}>{ready.recommendedPlan}</span></div>
              {ready.programs.map((p) => <div key={p.code} className="kv"><span>{p.name}</span><span>{p.ready ? 'meets marks' : p.gaps.filter((g) => !g.info).map((g) => g.code).join(', ') || 'ok'}</span></div>)}
              {ready.today.documentGaps.length > 0 && <div className="kv"><span>Docs missing</span><span>{ready.today.documentGaps.join('; ')}</span></div>}
              {ready.training.length > 0 && <div className="kv"><span>Extra training</span><span>{ready.training.map((t) => t.title.split(':')[0]).join('; ')}</span></div>}
            </>
          )}
        </section>

        <section className="card">
          <div className="h2" style={{ marginTop: 0 }}>Billing</div>
          {!bill ? <div className="loading">Loading…</div> : !bill.subscription ? (
            <div className="muted-card">No plan yet. Member has not chosen a pace.</div>
          ) : (
            <>
              <div className="kv"><span>Plan</span><span>{bill.subscription.planName}, {money(bill.subscription.priceCents)}/mo</span></div>
              <div className="kv"><span>Status</span><span className={`hbadge ${bill.subscription.status === 'active' ? (bill.subscription.cancelAtPeriodEnd ? 'amber' : 'green') : 'red'}`}>{bill.subscription.cancelAtPeriodEnd ? 'cancelling' : bill.subscription.status}</span></div>
              <div className="kv"><span>{bill.subscription.cancelAtPeriodEnd ? 'Ends' : 'Renews'}</span><span>{fmt(bill.subscription.currentPeriodEnd)}</span></div>
              <div className="kv"><span>Card</span><span>{bill.subscription.paymentMethod || 'on file'}</span></div>
            </>
          )}
          {bill?.sessions?.length > 0 && (
            <>
              <div className="h2">Counseling sessions</div>
              <table className="op-table">
                <thead><tr><th>When</th><th>Format</th><th>Paid</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {bill.sessions.map((s) => (
                    <tr key={s.id}>
                      <td>{new Date(s.scheduledAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</td>
                      <td>{s.format === 'group' ? `Group: ${s.groupTitle || ''}` : s.type}{s.topic ? `, ${s.topic}` : ''}</td>
                      <td>{money(s.priceCents)}</td>
                      <td><span className={`hbadge ${s.status === 'booked' ? 'amber' : s.status === 'completed' ? 'green' : 'red'}`}>{s.status}</span></td>
                      <td className="op-actions">
                        {s.status === 'booked' && s.roomCode && <a className="link" href={`/meet/${s.roomCode}`}>Room</a>}
                        {s.status === 'booked' && <button className="link-btn" onClick={() => mark(s.id, 'completed')}>Done</button>}
                        {s.status === 'booked' && <button className="link-btn danger" onClick={() => mark(s.id, 'cancelled')}>No-show</button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
