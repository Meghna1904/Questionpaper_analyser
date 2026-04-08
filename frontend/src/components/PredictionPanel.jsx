const MEDALS = ['🥇', '🥈', '🥉']

export default function PredictionPanel({ predictions }) {
  if (!predictions || predictions.length === 0) {
    return (
      <div className="empty-state" style={{ padding: '1.5rem' }}>
        <div className="empty-icon">🎯</div>
        <p>No predictions yet. Upload more papers for better accuracy.</p>
      </div>
    )
  }

  return (
    <div className="pred-list">
      {predictions.map((p, i) => (
        <div key={p.topic} className="pred-item">
          <div className="pred-rank">{MEDALS[i] || `#${i + 1}`}</div>
          <div className="pred-info">
            <div className="pred-topic">{p.topic}</div>
            <div className="pred-meta">
              <span>Module {p.module}</span>
              <span>×{p.frequency} seen</span>
              <span title="Consistency across papers">
                {Math.round(p.consistency * 100)}% consistent
              </span>
            </div>
          </div>
          <div className="pred-conf-wrap">
            <div className="pred-conf-num">{p.confidence_pct}%</div>
            <div className="pred-conf-label">confidence</div>
          </div>
        </div>
      ))}
    </div>
  )
}
