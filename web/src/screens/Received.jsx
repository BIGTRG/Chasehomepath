import { Link } from 'react-router-dom';

// Walkthrough screen 3: score deliberately withheld. The moment credit lands, it
// pivots straight to scheduling — the real answer waits for the meeting. (spec §8)
export default function Received() {
  return (
    <div className="content ctr">
      <div className="big-check" aria-hidden>✓</div>
      <h1 className="h1">We've got your credit</h1>
      <p className="p">
        Your file is in. We're not going to throw a number at you — the real plan comes
        from sitting down together.
      </p>

      <Link to="/schedule" className="card item-card" style={{ textAlign: 'left' }}>
        <div className="row">
          <span className="cc o">▶</span>
          <div className="grow">
            <div className="n">Set your appointment</div>
            <div className="s">In person or video — your choice</div>
          </div>
        </div>
      </Link>

      <Link to="/schedule">
        <button className="btn">Pick a time</button>
      </Link>

      <div className="gy" style={{ marginTop: 12, textAlign: 'left' }}>
        Most members are seen within 5 minutes of arriving. No long waits.
      </div>
    </div>
  );
}
