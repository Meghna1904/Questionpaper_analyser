function getFreqClass(rawCount) {
  if (rawCount >= 5) return 'hot'
  if (rawCount >= 3) return 'warm'
  if (rawCount >= 2) return 'cool'
  return 'cold'
}

export default function TopicTable({ topics, onClickTopic, allTopics }) {
  if (!topics || topics.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-icon">🔍</div>
        <p>No topics detected for this module.</p>
      </div>
    )
  }

  const maxCount = Math.max(...topics.map(t => t.raw_count), 1)

  return (
    <table className="topic-table">
      <thead>
        <tr>
          <th style={{ width: '28px' }}>#</th>
          <th>Topic</th>
          <th style={{ textAlign: 'right' }}>Times</th>
        </tr>
      </thead>
      <tbody>
        {topics.map((topic, i) => (
          <tr
            key={topic.topic}
            className="topic-row"
            onClick={() => onClickTopic && onClickTopic(topic)}
            title="Click to see all related questions"
          >
            <td className="topic-rank">{String(i + 1).padStart(2, '0')}</td>
            <td className="topic-name">
              {topic.topic}
              <small>
                Module {topic.module} · {topic.module_title}
              </small>
              {/* Mini inline bar */}
              <div style={{
                height: '3px',
                marginTop: '5px',
                background: 'rgba(255,255,255,0.05)',
                borderRadius: '2px',
                overflow: 'hidden',
                maxWidth: '160px',
              }}>
                <div style={{
                  height: '100%',
                  width: `${(topic.raw_count / maxCount) * 100}%`,
                  background: 'linear-gradient(90deg, var(--accent), var(--accent-2))',
                  borderRadius: '2px',
                  transition: 'width 0.6s cubic-bezier(0.4,0,0.2,1)',
                }} />
              </div>
            </td>
            <td>
              <span className={`freq-badge ${getFreqClass(topic.raw_count)}`}>
                {topic.raw_count}×
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
