import { Link } from 'react-router-dom';

// Walkthrough screen 1: the educate-first entry. No "book now" — it teaches
// homeownership and asks if they want to see where they stand. (spec §4.2)
export default function Discover() {
  return (
    <div className="content">
      <div className="vid" aria-hidden>
        <span className="play">▶</span>
      </div>

      <h1 className="h1">Own a home sooner than you think</h1>
      <p className="sub" style={{ fontSize: 14, lineHeight: 1.6 }}>
        See the exact steps, hear from people who did it, and find out your timeline —
        free, no calls, no pressure.
      </p>

      <div className="card">
        <div className="row">
          <span className="cc o">1</span>
          <div className="grow">
            <div className="n">Watch how it works</div>
            <div className="s">3 min</div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="row">
          <span className="cc o">2</span>
          <div className="grow">
            <div className="n">Real member stories</div>
            <div className="s">See their before and after</div>
          </div>
        </div>
      </div>

      <Link to="/register">
        <button className="btn" style={{ marginTop: 10 }}>See if you qualify</button>
      </Link>

      <div className="gy" style={{ marginTop: 12 }}>
        Free. No credit impact to check. No one calls unless you ask.
      </div>

      <p className="center-link">
        Already a member? <Link to="/login">Sign in</Link>
      </p>
    </div>
  );
}
