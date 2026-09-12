import { useState } from 'react';
import { Link } from 'react-router-dom';

// Walkthrough screen 1: the educate-first entry. No "book now" — it teaches
// homeownership and asks if they want to see where they stand. (spec §4.2)
const VIDEO_SRC = '/media/how-it-works.mp4';
const VIDEO_POSTER = '/media/how-it-works-poster.jpg';

export default function Discover() {
  const [playing, setPlaying] = useState(false);
  return (
    <div className="content">
      {playing ? (
        <video
          className="vid vid-player"
          src={VIDEO_SRC}
          poster={VIDEO_POSTER}
          controls
          autoPlay
          playsInline
          preload="metadata"
        />
      ) : (
        <button
          type="button"
          className="vid vid-btn"
          onClick={() => setPlaying(true)}
          aria-label="Play: how CHASE HomePath works, about two minutes"
          style={{ backgroundImage: `url(${VIDEO_POSTER})` }}
        >
          <span className="play" aria-hidden>&#9654;</span>
        </button>
      )}

      <h1 className="h1">Own a home sooner than you think</h1>
      <p className="sub" style={{ fontSize: 14, lineHeight: 1.6 }}>
        See the exact steps, hear from people who did it, and find out your timeline —
        free, no calls, no pressure.
      </p>

      <div className="card">
        <button type="button" className="row" onClick={() => setPlaying(true)}
          style={{ background: 'none', border: 0, padding: 0, width: '100%', textAlign: 'left', font: 'inherit', color: 'inherit', cursor: 'pointer' }}>
          <span className="cc o">1</span>
          <div className="grow">
            <div className="n">Watch how it works</div>
            <div className="s">2 min</div>
          </div>
        </button>
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
