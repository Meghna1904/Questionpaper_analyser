import { useState, useMemo } from 'react'
import ModuleTabs from './ModuleTabs'
import TopicTable from './TopicTable'
import FrequencyChart from './FrequencyChart'
import QuestionList from './QuestionList'
import PredictionPanel from './PredictionPanel'
import DrilldownModal from './DrilldownModal'

const MODULE_TITLES = {
  1: 'Module 1',
  2: 'Module 2',
  3: 'Module 3',
  4: 'Module 4',
  5: 'Module 5',
}

export default function ResultsPage({ results, onReset }) {
  const [activeModule, setActiveModule] = useState('all')
  const [filter, setFilter] = useState('all')   // 'all' | 'top' | 'uncertain'
  const [drillTopic, setDrillTopic] = useState(null)

  const {
    papers_analysed = [],
    total_questions = 0,
    ranked_topics_overall = [],
    ranked_topics_by_module = {},
    questions_by_module = {},
    predictions_by_module = {},
    top_predictions_overall = [],
    parse_info = [],
    syllabus = {},
  } = results

  // Current module data
  const isAll = activeModule === 'all'
  const modNum = isAll ? null : parseInt(activeModule)

  const rankedTopics = useMemo(() => {
    const list = isAll
      ? ranked_topics_overall
      : (ranked_topics_by_module[String(modNum)] || [])
    if (filter === 'top')      return list.slice(0, 10)
    if (filter === 'uncertain') return list.filter(t => t.count < 1.5)
    return list
  }, [isAll, modNum, ranked_topics_overall, ranked_topics_by_module, filter])

  const questions = useMemo(() => {
    if (isAll) {
      return Object.values(questions_by_module).flat()
    }
    return questions_by_module[String(modNum)] || []
  }, [isAll, modNum, questions_by_module])

  const predictions = useMemo(() => {
    if (isAll) return top_predictions_overall.slice(0, 5)
    return predictions_by_module[String(modNum)] || []
  }, [isAll, modNum, predictions_by_module, top_predictions_overall])

  const moduleTitle = isAll ? 'All Modules' : (syllabus[modNum]?.title || MODULE_TITLES[modNum] || `Module ${modNum}`)

  return (
    <div className="results-page">
      {/* Stats bar */}
      <div className="stats-bar">
        <div className="stat-card">
          <div className="stat-label">Papers Analysed</div>
          <div className="stat-value">{papers_analysed.length}</div>
          <div className="stat-sub">{papers_analysed.map(p => p.replace('.pdf','')).join(', ')}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total Questions</div>
          <div className="stat-value">{total_questions}</div>
          <div className="stat-sub">across all papers &amp; modules</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Unique Topics</div>
          <div className="stat-value">{ranked_topics_overall.length}</div>
          <div className="stat-sub">detected across syllabus</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Top Predicted</div>
          <div className="stat-value" style={{ fontSize: '1rem', paddingTop: '0.4rem' }}>
            {top_predictions_overall[0]?.topic?.substring(0, 22) || '—'}
          </div>
          <div className="stat-sub">
            {top_predictions_overall[0] ? `${top_predictions_overall[0].confidence_pct}% confidence` : ''}
          </div>
        </div>
      </div>

      {/* Parse info warnings */}
      {parse_info.some(p => p.error) && (
        <div className="error-banner" style={{ marginBottom: '1.5rem' }}>
          ⚠ OCR issues detected in some files:{' '}
          {parse_info.filter(p => p.error).map(p => `${p.file}: ${p.error}`).join(' | ')}
        </div>
      )}

      {/* Module tabs */}
      <ModuleTabs
        active={activeModule}
        onChange={setActiveModule}
        syllabus={syllabus}
        questionsByModule={questions_by_module}
      />

      {/* Main grid */}
      <div className="results-grid" style={{ marginTop: '1.5rem' }}>
        {/* LEFT: Topic table + chart */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Frequency chart */}
          <div className="panel">
            <div className="panel-header">
              <div className="panel-title">📈 Topic Frequency — {moduleTitle}</div>
            </div>
            <div className="panel-body">
              <FrequencyChart topics={rankedTopics.slice(0, 8)} />
            </div>
          </div>

          {/* Topic table */}
          <div className="panel">
            <div className="panel-header">
              <div className="panel-title">🔥 Topic Rankings</div>
              <div className="filter-row" style={{ margin: 0, gap: '0.35rem' }}>
                {[
                  { id: 'all', label: 'All' },
                  { id: 'top', label: 'Top 10' },
                  { id: 'uncertain', label: 'Rare' },
                ].map(f => (
                  <button
                    key={f.id}
                    className={`filter-btn ${filter === f.id ? 'active' : ''}`}
                    onClick={() => setFilter(f.id)}
                  >{f.label}</button>
                ))}
              </div>
            </div>
            <div className="panel-body">
              <TopicTable
                topics={rankedTopics}
                onClickTopic={setDrillTopic}
                allTopics={ranked_topics_overall}
              />
            </div>
          </div>
        </div>

        {/* RIGHT: Questions + predictions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Prediction panel */}
          <div className="panel">
            <div className="panel-header">
              <div className="panel-title">🎯 Predictions — {moduleTitle}</div>
            </div>
            <div className="panel-body">
              <PredictionPanel predictions={predictions} />
            </div>
          </div>

          {/* Question list */}
          <div className="panel">
            <div className="panel-header">
              <div className="panel-title">📋 Questions — {moduleTitle}</div>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                {questions.length} items
              </span>
            </div>
            <div className="panel-body">
              <QuestionList questions={questions} />
            </div>
          </div>
        </div>
      </div>

      {/* Drill-down modal */}
      {drillTopic && (
        <DrilldownModal
          topic={drillTopic}
          allQuestions={Object.values(questions_by_module).flat()}
          onClose={() => setDrillTopic(null)}
        />
      )}
    </div>
  )
}
