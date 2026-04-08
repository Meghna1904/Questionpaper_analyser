import { useState } from 'react'

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

function TopicChip({ topic }) {
  return (
    <div className="topic-chip">
      <span>{topic.name}</span>
      <ConfBar score={topic.score} />
    </div>
  )
}

function PartASection({ questions }) {
  if (!questions || !questions.length) return null
  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <h3 className="text-sm" style={{ color: 'var(--text-muted)', marginBottom: '0.5rem', fontWeight: 600 }}>Part A — 3 Marks</h3>
      {questions.map((q, i) => (
        <div key={i} className="question-row" style={{ display: 'flex', gap: '10px', padding: '10px', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
          <span style={{ fontWeight: 700, color: 'var(--accent-3)' }}>Q{q.number}</span>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: '0.85rem' }}>{q.text}</p>
            {q.topics?.length > 0 && (
              <div className="q-topics">
                {q.topics.slice(0, 2).map((t, idx) => <TopicChip key={idx} topic={t} />)}
              </div>
            )}
          </div>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>📄 {q.source?.replace('.pdf','')}</span>
        </div>
      ))}
    </div>
  )
}

function PartBSection({ questions }) {
  if (!questions || !questions.length) return null
  return (
    <div>
      <h3 className="text-sm" style={{ color: 'var(--text-muted)', marginBottom: '0.5rem', fontWeight: 600 }}>Part B — Essay</h3>
      {questions.map((q, i) => (
        <div key={i} className="essay-card" style={{ background: 'rgba(0,0,0,0.2)', padding: '15px', borderRadius: '12px', marginTop: '10px', border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
            <span style={{ fontWeight: 700, color: 'var(--accent)' }}>Q{q.number} {q.is_or_variant && <span className="q-badge or-variant" style={{ marginLeft: '6px' }}>OR</span>}</span>
            <span className="marks" style={{ background: 'var(--accent)', color: '#0a0d14', padding: '2px 8px', borderRadius: '6px', fontSize: '12px', fontWeight: 700 }}>14 Marks</span>
          </div>
          
          {q.subQuestions && (
            <ul style={{ listStyleType: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {q.subQuestions.map((sub, idx) => (
                <li key={idx} style={{ fontSize: '0.85rem' }}>
                  <span style={{ marginRight: '6px', fontWeight: 700 }}>{sub.marker}</span> 
                  {sub.text}
                  {sub.topics?.length > 0 && (
                    <div className="q-topics" style={{ marginTop: '0.4rem' }}>
                      {sub.topics.slice(0, 2).map((t, tidx) => <TopicChip key={tidx} topic={t} />)}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
          <div style={{ marginTop: '0.8rem', fontSize: '0.7rem', color: 'var(--text-muted)', textAlign: 'right' }}>
            📄 {q.source?.replace('.pdf','')}
          </div>
        </div>
      ))}
    </div>
  )
}

function TopicView({ rankedTopics }) {
  return (
    <div className="topic-view" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {rankedTopics.map((topic, i) => (
        <div key={i} className="essay-card" style={{ background: 'rgba(255,255,255,0.02)', padding: '15px', borderRadius: '12px', border: '1px solid var(--border)' }}>
          <div style={{ marginBottom: '1rem', paddingBottom: '0.75rem', borderBottom: '1px solid var(--border)' }}>
            <h3 style={{ color: 'var(--accent-2)', fontSize: '1.05rem', margin: 0 }}>{topic.topic}</h3>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Appeared {topic.raw_count} times</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {topic.questions.map((q, qidx) => (
              <div key={qidx} style={{ fontSize: '0.85rem', padding: '6px', background: 'rgba(0,0,0,0.2)', borderRadius: '6px' }}>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', marginBottom: '4px' }}>
                  Q{q.q_num} • 📄 {q.source?.replace('.pdf','')}
                </div>
                {q.text}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

export default function QuestionList({ questions, moduleStructure, rankedTopics }) {
  const [viewMode, setViewMode] = useState('exam') // 'exam' | 'topic'

  if (!moduleStructure && !rankedTopics?.length) {
    return (
      <div className="empty-state">
        <div className="empty-icon">📋</div>
        <p>No data available.</p>
      </div>
    )
  }

  return (
    <div className="q-list-wrapper">
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', paddingBottom: '1rem', borderBottom: '1px solid var(--border)' }}>
        <button 
          className={`filter-btn ${viewMode === 'exam' ? 'active' : ''}`}
          onClick={() => setViewMode('exam')}
        >
          📄 Exam Structure
        </button>
        <button 
          className={`filter-btn ${viewMode === 'topic' ? 'active' : ''}`}
          onClick={() => setViewMode('topic')}
        >
          📊 Group by Topic
        </button>
      </div>

      {viewMode === 'exam' && moduleStructure ? (
        <div className="module-block">
          {Object.entries(moduleStructure).map(([modNum, data]) => {
            if (!data.partA.length && !data.partB.length) return null;
            return (
              <div key={modNum} style={{ marginBottom: '2.5rem' }}>
                <h2 style={{ fontSize: '1.1rem', marginBottom: '1rem', color: 'var(--text-primary)' }}>Module {modNum}</h2>
                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '1.5rem' }}>
                  <PartASection questions={data.partA} />
                  <PartBSection questions={data.partB} />
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <TopicView rankedTopics={rankedTopics} />
      )}
    </div>
  )
}
