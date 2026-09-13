import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { agentReview, agent as agentApi } from '../api/client.js';
import ScreenTop from '../components/ScreenTop.jsx';

// AI counselor walkthrough: after the first consultation and payment, the agent
// steps through the plan and each credit item. Every line is generated from the
// member's own file and copy-gated server-side.
export default function PlanReview() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [i, setI] = useState(0);
  const [q, setQ] = useState('');
  const [answer, setAnswer] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => { agentReview.planReview().then(setData).catch((e) => setError(e.message)); }, []);

  if (error) return <div className="content"><div className="error">{error}</div></div>;
  if (!data) return <div className="loading">Loading…</div>;
  const step = data.steps[i];
  const last = i === data.steps.length - 1;

  async function ask() {
    if (!q.trim()) return;
    setBusy(true);
    try { setAnswer((await agentApi.ask(`${q} (About: ${step.title})`)).answer); } catch (e) { setAnswer(e.message); } finally { setBusy(false); }
  }

  return (
    <div className="content">
      <ScreenTop title="Your plan review" sub={data.plan ? `${data.plan.name} pace, ${data.plan.targetMonths}-month target` : 'Guided by your HomePath counselor'} right={<Link className="link" to="/">Exit</Link>} />

      {!data.ready && (
        <div className="note">Your full review unlocks once you choose a pace. <Link to="/plans">See plans</Link>. You can still preview it below.</div>
      )}

      <div className="review-progress"><i style={{ width: `${((i + 1) / data.steps.length) * 100}%` }} /></div>
      <div className="tsub">Step {i + 1} of {data.steps.length}</div>

      <div className="card review-card">
        <div className="review-avatar">AI</div>
        <div className="n">{step.title}</div>
        <p className="review-say">{step.say}</p>
        {step.screen && step.screen !== '/' && <Link className="link" to={step.screen}>Open this screen</Link>}
      </div>

      <div className="review-ask">
        <input value={q} placeholder="Ask about this step…" onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && ask()} />
        <button type="button" className="btn small" disabled={busy || !q.trim()} onClick={ask}>{busy ? '…' : 'Ask'}</button>
      </div>
      {answer && <div className="card soft"><div className="s">{answer}</div></div>}

      <div className="review-nav">
        <button type="button" className="btn outline" disabled={i === 0} onClick={() => { setI(i - 1); setAnswer(null); }}>Back</button>
        {last ? <button type="button" className="btn" onClick={() => navigate('/')}>Go to my plan</button>
          : <button type="button" className="btn" onClick={() => { setI(i + 1); setAnswer(null); }}>Next</button>}
      </div>
      <p className="legal-note">Your counselor speaks only from your file. Rate, loan-term, and legal questions go to your licensed team.</p>
    </div>
  );
}
