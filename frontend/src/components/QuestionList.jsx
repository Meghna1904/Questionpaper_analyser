function ConfBar({ score }) {
  const pct = Math.round(score * 100)
  return (
    <div className="conf-bar-wrap">
      <div className="conf-bar-bg">
        <div className="conf-bar-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="conf-pct">{pct}%</span>
    </div>
  )
}

function QuestionCard({ q }) {
  const isPartA = q.part === 'A'
  const isOr    = q.is_or_variant

  return (
    <div className="q-card">
      <div className="q-card-header">
        <span className={`q-badge ${isPartA ? 'part-a' : 'part-b'}`}>
          {isPartA ? `Part A · Q${q.q_num}` : `Part B · Q${q.q_num}${q.sub ? q.sub + ')' : ''}`}
        </span>
        {isOr && <span className="q-badge or-variant">OR</span>}
      </div>
      <p className="q-text">{q.text}</p>
      <div className="q-source">📄 {q.source}</div>

      {q.topics && q.topics.length > 0 && (
        <div className="q-topics">
          {q.topics.map((t, i) => (
            <div key={i} className="topic-chip">
              <span>{t.name}</span>
              <ConfBar score={t.score} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function QuestionList({ questions }) {
  if (!questions || questions.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-icon">📋</div>
        <p>No questions in this module.</p>
      </div>
    )
  }

  return (
    <div className="q-list">
      {questions.map((q, i) => (
        <QuestionCard key={i} q={q} />
      ))}
    </div>
  )
}
