import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { journey as journeyApi } from '../api/client.js';
import ScreenTop from '../components/ScreenTop.jsx';

// One lesson: opens in its scheduled window, a handful of points, then a three-question
// check. Pass marks it done; a miss re-books the same slot one week out.
export default function Lesson() {
  const { moduleId } = useParams();
  const navigate = useNavigate();
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => journeyApi.lesson(moduleId).then(setD).catch((e) => setError(e.message)), [moduleId]);
  useEffect(() => { load(); }, [load]);

  async function submit() {
    setBusy(true); setError(null);
    try { setResult(await journeyApi.check(moduleId, d.lesson.quiz.map((_, i) => answers[i] ?? -1))); } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  if (error && !d) return <div className="content"><div className="error">{error}</div></div>;
  if (!d) return <div className="loading">Loading…</div>;

  return (
    <div className="content">
      <ScreenTop title={d.module.title} sub={`${d.module.durationMin} min · pass ${d.lesson?.passMark ?? 2} of 3`} right={<Link className="link" to="/learn">Learn</Link>} />
      {error && <div className="error">{error}</div>}

      {!d.open && (
        <div className="card hl"><div className="n">Not open yet</div><p className="s" style={{ margin: '4px 0 8px' }}>{d.reason}. Lessons run on your approved schedule so they actually get done.</p><Link className="btn outline" to="/start/training">See my schedule</Link></div>
      )}

      {d.open && d.lesson && !result && (
        <>
          <div className="card">
            <ol className="lesson-points">{d.lesson.points.map((p, i) => <li key={i}>{p}</li>)}</ol>
          </div>
          {d.done ? <div className="note">You already passed this lesson. Read it any time.</div> : (
            <>
              <div className="h2">Quick check</div>
              {d.lesson.quiz.map((q, qi) => (
                <div key={qi} className="card">
                  <div className="n" style={{ marginBottom: 8 }}>{qi + 1}. {q.q}</div>
                  {q.options.map((o, oi) => (
                    <label key={oi} className={`quiz-opt ${answers[qi] === oi ? 'sel' : ''}`}><input type="radio" name={`q${qi}`} checked={answers[qi] === oi} onChange={() => setAnswers({ ...answers, [qi]: oi })} /><span>{o}</span></label>
                  ))}
                </div>
              ))}
              <button type="button" className="btn" disabled={busy || Object.keys(answers).length < d.lesson.quiz.length} onClick={submit}>Submit my answers</button>
            </>
          )}
        </>
      )}

      {result && (
        <div className={`card ${result.passed ? 'gl' : 'hl'}`}>
          <div className="n">{result.passed ? 'Passed' : 'Not yet'}: {result.score} of {result.total}</div>
          <p className="s" style={{ margin: '4px 0 10px', lineHeight: 1.5 }}>{result.passed ? 'This lesson is marked done and your plan moved forward.' : 'Read the points again and retry now, or it is back on your calendar one week from this slot.'}</p>
          {result.passed ? <button type="button" className="btn" onClick={() => navigate('/learn')}>Back to Learn</button>
            : <button type="button" className="btn" onClick={() => { setResult(null); setAnswers({}); load(); }}>Try again</button>}
        </div>
      )}
    </div>
  );
}
