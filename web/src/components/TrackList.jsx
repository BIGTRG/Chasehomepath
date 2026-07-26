// The six-track progress view (credit, budget, savings, education, readiness, timeline).
export default function TrackList({ tracks }) {
  return (
    <div className="card">
      <div className="h2" style={{ marginTop: 0 }}>
        Your six tracks
      </div>
      {tracks.map((t) => (
        <div key={t.track_type} className={`track ${t.track_type}`}>
          <div className="track-top">
            <span className="track-name">{t.track_type}</span>
            <span className="track-pct">{t.progress_pct}%</span>
          </div>
          <div className="bar">
            <span style={{ width: `${t.progress_pct}%` }} />
          </div>
          <div className="track-status">{t.status.replace('_', ' ')}</div>
        </div>
      ))}
    </div>
  );
}
