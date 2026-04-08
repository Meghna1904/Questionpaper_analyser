import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import axios from 'axios'
import ResultsPage from './components/ResultsPage'
import './index.css'

const API_BASE = 'http://localhost:5000/api'

const LOADING_STEPS = [
  { id: 'upload',  label: 'Uploading files…' },
  { id: 'parse',   label: 'Extracting questions from PDFs…' },
  { id: 'syllabus',label: 'Parsing syllabus…' },
  { id: 'nlp',     label: 'Running NLP topic matching (SBERT)…' },
  { id: 'predict', label: 'Generating predictions…' },
]

function App() {
  const [files, setFiles]           = useState([])
  const [syllabusText, setSyllabusText] = useState('')
  const [loading, setLoading]       = useState(false)
  const [loadStep, setLoadStep]     = useState(0)
  const [results, setResults]       = useState(null)
  const [error, setError]           = useState('')

  // ── PDF Dropzone ───────────────────────────────────────────────────────
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

  // ── Analyse ────────────────────────────────────────────────────────────
  const handleAnalyse = async () => {
    if (!files.length) { setError('Please upload at least one PDF.'); return }

    setLoading(true)
    setLoadStep(0)
    setError('')
    setResults(null)

    try {
      const form = new FormData()
      files.forEach(f => form.append('files[]', f))
      if (syllabusText.trim()) form.append('syllabus_text', syllabusText)

      // Simulate step progression while waiting for API
      const stepTimer = setInterval(() => {
        setLoadStep(s => Math.min(s + 1, LOADING_STEPS.length - 1))
      }, 1800)

      const { data } = await axios.post(`${API_BASE}/analyse`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 180000,
      })

      clearInterval(stepTimer)
      setLoadStep(LOADING_STEPS.length)
      setResults(data)
    } catch (err) {
      setError(
        err.response?.data?.error ||
        err.message ||
        'Analysis failed. Make sure the backend is running.'
      )
    } finally {
      setLoading(false)
    }
  }

  const handleExportPDF = () => {
    // Relying on native window.print() allows the user to 'Save as PDF' 
    // with actual selectable text rather than an image canvas screenshot.
    window.print()
  }

  const handleReset = () => {
    setResults(null)
    setFiles([])
    setSyllabusText('')
    setError('')
    setLoadStep(0)
  }

  // ── Render ─────────────────────────────────────────────────────────────
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
            <button className="navbar-btn" onClick={handleExportPDF} style={{ background: 'var(--text-primary)', color: 'var(--bg-primary)' }}>
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
        <ResultsPage results={results} onReset={handleReset} />
      ) : loading ? (
        <div className="upload-page">
          <div className="loading-overlay">
            <div className="spinner" />
            <div>
              <p style={{ fontWeight: 600, marginBottom: '1rem' }}>
                Analysing your papers…
              </p>
              <div className="loading-steps">
                {LOADING_STEPS.map((step, i) => (
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
              <p>or click to browse files</p>

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
            <h3>📚 Syllabus <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional — uses built-in CST446 if left blank)</span></h3>

            <textarea
              className="syllabus-textarea"
              placeholder={`Module 1 (Topic Title)\nTopic A, Topic B, Topic C...\n\nModule 2 (Topic Title)\nTopic D, Topic E...\n\n[Use commas or newlines to separate topics]`}
              value={syllabusText}
              onChange={e => setSyllabusText(e.target.value)}
              rows={6}
            />
            <div className="syllabus-placeholder">
              💡 Leave blank to use built-in CST446 Data Compression syllabus
            </div>
          </div>

          {/* Analyse button */}
          <button
            className="analyse-btn"
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
