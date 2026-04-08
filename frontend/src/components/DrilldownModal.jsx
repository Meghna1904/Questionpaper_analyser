import { useEffect } from 'react'

export default function DrilldownModal({ topic, allQuestions, onClose }) {
  // Close on Escape key
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  // Find all questions that mention this topic
  const related = allQuestions.filter(q =>
    q.topics?.some(t => t.name === topic.topic)
  )

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2>🔍 {topic.topic}</h2>
            <p>
              Module {topic.module} · {topic.module_title} ·{' '}
              <strong style={{ color: 'var(--accent)' }}>{topic.raw_count} total occurrences</strong>
            </p>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="modal-body">
          {related.length === 0 ? (
            <div className="empty-state">
              <p>No questions matched this topic with high confidence.</p>
            </div>
          ) : (
            <>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                {related.length} question{related.length !== 1 ? 's' : ''} reference this topic:
              </p>
              <div className="q-list">
                {related.map((q, i) => {
                  const topicMatch = q.topics.find(t => t.name === topic.topic)
                  const conf = topicMatch ? Math.round(topicMatch.score * 100) : 0
                  return (
                    <div key={i} className="q-card">
                      <div className="q-card-header">
                        <span className={`q-badge ${q.part === 'A' ? 'part-a' : 'part-b'}`}>
                          {q.part === 'A' ? `Part A · Q${q.q_num}` : `Part B · Q${q.q_num}${q.sub ? q.sub + ')' : ''}`}
                        </span>
                        <span style={{
                          fontSize: '0.72rem',
                          color: conf >= 70 ? 'var(--accent-3)' : conf >= 50 ? 'var(--accent)' : 'var(--text-muted)',
                          fontFamily: 'monospace',
                          marginLeft: 'auto',
                        }}>
                          Match: {conf}%
                        </span>
                      </div>
                      <p className="q-text">{q.text}</p>
                      <div className="q-source">📄 {q.source}</div>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
