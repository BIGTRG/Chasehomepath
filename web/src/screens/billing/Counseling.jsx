import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { billing as billingApi } from '../../api/client.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import ScreenTop from '../../components/ScreenTop.jsx';
import { money } from './Plans.jsx';

const fmtWhen = (d) => new Date(d).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

// Counseling as its own product: marketing page + booking entry. Public; members
// see live group seats and can join with one tap.
export default function Counseling() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);

  const load = () => billingApi.counseling().then(setData).catch((e) => setError(e.message));
  useEffect(() => { load(); }, [user]);

  if (error) return <div className="content"><div className="error">{error}</div></div>;
  if (!data) return <div className="loading">Loading…</div>;
  const isMember = user?.role === 'member';

  async function join(g) {
    if (!isMember) return navigate('/register', { state: { next: '/counseling' } });
    setBusy(g.id);
    setError(null);
    try {
      await billingApi.joinGroup(g.id, {});
      await load();
      navigate('/billing');
    } catch (e) {
      if (e.code === 'validation_error' && /payment method/i.test(e.message)) navigate(`/group/${g.id}/pay`);
      else setError(e.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="content">
      <ScreenTop title="Talk to a person" sub="Money counseling, one on one or in a group. Built for the moments a checklist cannot fix." right={user ? <Link className="link" to="/">Plan</Link> : <Link className="link" to="/login">Sign in</Link>} />

      <div className="hero-card">
        <div className="hero-k">Does this sound like you?</div>
        <ul className="hero-list">
          {data.topics.filter((t) => t.code !== 'other').slice(0, 5).map((t) => <li key={t.code}>{t.name}</li>)}
        </ul>
        <div className="hero-s">Forty-five minutes with a specialist who has seen it before. No judgment, no lecture, a plan you can start tonight.</div>
      </div>

      <div className="card plan-card hl">
        <div className="row"><div className="grow"><div className="n">1:1 session</div><div className="s">{data.single.durationMin} minutes, video, phone, or in person</div></div><div className="plan-price">{money(data.single.priceCents)}</div></div>
        <ul className="plan-feats">
          <li>Pick a topic or bring your own</li>
          <li>Your specialist sees your plan and file before you start</li>
          <li>Book any time, as often as your plan calls for</li>
          <li>Full refund if cancelled 24 hours ahead</li>
        </ul>
        <button type="button" className="btn" onClick={() => navigate(isMember ? '/sessions/book' : '/register')}>Book a 1:1</button>
      </div>

      <div className="card plan-card">
        <div className="row"><div className="grow"><div className="n">Group session</div><div className="s">{data.group.durationMin} minutes, live video, small group</div></div><div className="plan-price">{money(data.group.priceCents)}</div></div>
        <ul className="plan-feats">
          <li>One topic, one hour, a room of people working the same problem</li>
          <li>Live Q and A with the specialist</li>
          <li>Seats are limited so everyone gets a turn</li>
        </ul>
      </div>

      <div className="h2">Upcoming group sessions</div>
      {data.groupSessions.length === 0 ? (
        <div className="card muted-card">New sessions are posted weekly. Book a 1:1 any time.</div>
      ) : data.groupSessions.map((g) => (
        <div key={g.id} className="card">
          <div className="row">
            <div className="grow"><div className="n">{g.title}</div><div className="s">{fmtWhen(g.scheduledAt)}, {g.durationMin} min{g.host ? `, with ${g.host}` : ''}</div></div>
            <div className="plan-price sm">{money(g.priceCents)}</div>
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            <span className={`pill ${g.seatsLeft === 0 ? 'n' : 'g'}`}>{g.joined ? 'You have a seat' : g.seatsLeft === 0 ? 'Full' : `${g.seatsLeft} seat${g.seatsLeft === 1 ? '' : 's'} left`}</span>
            <span className="grow" />
            {g.joined ? <Link className="btn small" to={`/meet/${g.roomCode}`}>Open room</Link>
              : <button type="button" className="btn small" disabled={g.seatsLeft === 0 || busy === g.id} onClick={() => join(g)}>{busy === g.id ? 'Booking…' : 'Take a seat'}</button>}
          </div>
        </div>
      ))}

      <div className="h2">Topics we cover</div>
      <div className="card list">
        {data.topics.map((t) => (
          <div key={t.code} className="row"><div className="grow"><div className="n">{t.name}</div><div className="s">{t.blurb}</div></div></div>
        ))}
      </div>

      <p className="legal-note">Counseling is education and planning. It is not legal, tax, lending, or credit repair advice, and no outcome is promised. Sessions are separate from any plan fee.</p>
    </div>
  );
}
