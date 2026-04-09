import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import ResultsPage from './components/ResultsPage'
import { analyseFiles } from './lib/analyseEngine'
import './index.css'

// ── Loading steps (frontend-only, no upload step) ─────────────────────────
const BASE_STEPS = [
  { id: 'syllabus',  label: 'Parsing syllabus…' },
  { id: 'extract',   label: 'Extracting PDF text…' },
  { id: 'questions', label: 'Extracting questions…' },
  { id: 'topics',    label: 'Matching topics…' },
  { id: 'predict',   label: 'Generating predictions…' },
]

function App() {
  const [files, setFiles]             = useState([])
  const [syllabusText, setSyllabusText] = useState('')
  const [loading, setLoading]         = useState(false)
  const [loadMsg, setLoadMsg]         = useState('')
  const [loadStep, setLoadStep]       = useState(0)
  const [results, setResults]         = useState(null)
  const [error, setError]             = useState('')

  // ── PDF Dropzone ─────────────────────────────────────────────────────────
  const onDrop = useCallback((accepted) => {
    setFiles(prev => {
      const names = new Set(prev.map(f => f.name))
      return [...prev, ...accepted.filter(f => !names.has(f.name))]
    })
    setError('')
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'] },
    multiple: true,
  })

  const removeFile = (name) => setFiles(f => f.filter(x => x.name !== name))

  // ── Progress callback from engine ────────────────────────────────────────
  const onProgress = (msg) => {
    setLoadMsg(msg)
    setLoadStep(prev => Math.min(prev + 1, BASE_STEPS.length - 1))
  }

  // ── Analyse ──────────────────────────────────────────────────────────────
  const handleAnalyse = async () => {
    if (!files.length) { setError('Please upload at least one PDF.'); return }
    if (!syllabusText.trim()) { setError('Please provide the syllabus text to match topics against.'); return }

    setLoading(true)
    setLoadStep(0)
    setLoadMsg('Starting analysis…')
    setError('')
    setResults(null)

    try {
      const data = await analyseFiles(files, syllabusText, onProgress)
      setLoadStep(BASE_STEPS.length)
      setResults(data)
    } catch (err) {
      setError(err.message || 'Analysis failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // ── Client-side Structured PDF export via pdfmake ─────────────────────────
  const handleExportPDF = async () => {
    try {
      if (!results) { setError('Nothing to export yet.'); return }
      
      const { generateStructuredPDF } = await import('./lib/pdfReportGenerator');
      generateStructuredPDF(results);
    } catch (err) {
      console.error(err);
      setError(err.message || 'PDF export failed.')
    }
  }

  // ── Reset ────────────────────────────────────────────────────────────────
  const handleReset = () => {
    setResults(null)
    setFiles([])
    setSyllabusText('')
    setError('')
    setLoadStep(0)
    setLoadMsg('')
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="app">
      {/* Navbar */}
      <nav className="navbar">
        <div className="navbar-brand">
          <div className="navbar-logo">📊</div>
          QP Analyser
          <span className="navbar-chip">BETA</span>
        </div>
        {results && (
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button
              className="navbar-btn"
              onClick={handleExportPDF}
              style={{ background: 'var(--text-primary)', color: 'var(--bg-primary)' }}
            >
              📥 Export PDF
            </button>
            <button className="navbar-btn" onClick={handleReset}>
              ↑ New Analysis
            </button>
          </div>
        )}
      </nav>

      {/* Content */}
      {results ? (
        <div id="results-root">
          <ResultsPage results={results} onReset={handleReset} />
        </div>
      ) : loading ? (
        <div className="upload-page">
          <div className="loading-overlay">
            <div className="spinner" />
            <div>
              <p style={{ fontWeight: 600, marginBottom: '1rem' }}>
                Analysing your papers…
              </p>
              {/* Dynamic live message */}
              <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '1.25rem', minHeight: '1.2em' }}>
                {loadMsg}
              </p>
              <div className="loading-steps">
                {BASE_STEPS.map((step, i) => (
                  <div
                    key={step.id}
                    className={`loading-step ${i < loadStep ? 'done' : i === loadStep ? 'active' : ''}`}
                  >
                    <span>{i < loadStep ? '✓' : i === loadStep ? '→' : '○'}</span>
                    {step.label}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <main className="upload-page">
          {/* Hero */}
          <div className="upload-hero">
            <h1>Analyse Your <span>Question Papers</span></h1>
            <p>
              Upload multiple exam PDFs and your syllabus — get instant topic
              frequency analysis, module rankings, and predicted questions.
              <br />
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                ✨ 100% in-browser — no server, no upload, no wait
              </span>
            </p>
          </div>

          {/* Error banner */}
          {error && <div className="error-banner">⚠ {error}</div>}

          {/* PDF Dropzone */}
          <div className="dropzone-wrapper">
            <div
              {...getRootProps()}
              className={`dropzone ${isDragActive ? 'active' : ''}`}
            >
              <input {...getInputProps()} />
              <span className="dropzone-icon">📄</span>
              <h3>{isDragActive ? 'Drop PDFs here' : 'Drag & drop question paper PDFs'}</h3>
              <p>or click to browse files &nbsp;·&nbsp; digital PDFs only</p>

              {files.length > 0 && (
                <div className="file-list" onClick={e => e.stopPropagation()}>
                  {files.map(f => (
                    <div key={f.name} className="file-chip">
                      📄 {f.name}
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        ({(f.size / 1024).toFixed(0)} KB)
                      </span>
                      <button
                        className="file-chip-remove"
                        onClick={() => removeFile(f.name)}
                        title="Remove"
                      >×</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Syllabus Card */}
          <div className="syllabus-card">
            <h3>📚 Syllabus</h3>
            <textarea
              className="syllabus-textarea"
              placeholder={`Module 1 (Introduction to Automata)\nFinite Automata, DFA, NFA, Regular Expressions\n\nModule 2 (Context-Free Languages)\nCFG, Pushdown Automata, CYK Algorithm\n\n[Use commas or newlines to separate topics]`}
              value={syllabusText}
              onChange={e => setSyllabusText(e.target.value)}
              rows={7}
            />
          </div>

          {/* Analyse button */}
          <button
            className="analyse-btn"
            id="analyse-btn"
            onClick={handleAnalyse}
            disabled={!files.length || loading}
          >
            {loading ? 'Analysing…' : `🔍 Analyse ${files.length || ''} Paper${files.length !== 1 ? 's' : ''}`}
          </button>
        </main>
      )}
    </div>
  )
}

export default App
