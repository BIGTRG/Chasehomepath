import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { journey as journeyApi } from '../../api/client.js';

const ROUTE = { credit: '/start/credit', docs: '/start/docs', book: '/start/book', meeting: '/start/book', training: '/start/training', budget: '/money/setup', done: '/' };

// Onboarding v2 hub: six steps, status derived from the file. Lands on the current step.
export default function StartHub() {
  const navigate = useNavigate();
  const [s, setS] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => { journeyApi.status().then(setS).catch((e) => setError(e.message)); }, []);
  if (error) return <div className="content"><div className="error">{error}</div></div>;
  if (!s) return <div className="loading">Loading…</div>;

  const meetingOpen = s.meeting?.status === 'started';
  const currentRoute = meetingOpen ? `/meet/${s.counselor.name.toLowerCase()}/${s.meeting.id}` : s.current === 'meeting' && s.appointment && !s.subscription ? '/plans' : ROUTE[s.current];

  return (
    <div className="content">
      <img src="/logo.png" alt="CHASE HomePath" className="auth-logo sm" style={{ margin: '4px auto 14px' }} />
      <h1 className="h1">Your first day</h1>
      <p className="sub">Seven short steps to a plan. Pick up where you left off.</p>

      <div className="card list">
        {s.steps.map((st, i) => (
          <div key={st.key} className={`row ${st.done ? 'done' : ''}`}>
            <span className={`cc ${st.done ? 'g' : st.key === s.current ? 'o' : ''}`}>{st.done ? '✓' : i + 1}</span>
            <div className="grow"><div className="n">{st.title}</div>{st.detail && <div className="s">{st.detail}</div>}</div>
            {st.key === s.current && <span className="pill w">Now</span>}
          </div>
        ))}
      </div>

      <button type="button" className="btn" onClick={() => navigate(currentRoute)} style={{ marginTop: 10 }}>
        {s.current === 'done' ? 'Go to your plan' : meetingOpen ? `Rejoin ${s.counselor.name}` : 'Continue'}
      </button>
      <p className="center-link"><Link to="/">Skip to my plan for now</Link></p>
    </div>
  );
}
