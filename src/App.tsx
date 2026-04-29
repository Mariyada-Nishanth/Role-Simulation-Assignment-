import { useEffect, useMemo, useState } from 'react'
import type { Analysis, Dimension } from './lib/analysisTypes'
import { parseAnalysis } from './lib/parseAnalysis'
import { generateAnalysis, testConnection } from './lib/ollama'

const LS_OLLAMA_URL = 'trinethra.ollamaUrl'
const LS_MODEL = 'trinethra.model'

const DEFAULT_OLLAMA_URL = 'http://localhost:11434'
const DEFAULT_MODEL = 'qwen2.5:7b'

const dimensionLabel: Record<Dimension, string> = {
  execution: 'Execution',
  systems_building: 'Systems Building',
  kpi_impact: 'KPI Impact',
  change_management: 'Change Management',
}

function bandKey(band: Analysis['score']['band']) {
  if (band === 'Need Attention') return 'need-attention'
  if (band === 'Productivity') return 'productivity'
  return 'performance'
}

async function safeCopy(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }

  // Fallback for older browsers.
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.style.position = 'fixed'
  textarea.style.left = '-9999px'
  document.body.appendChild(textarea)
  textarea.focus()
  textarea.select()
  document.execCommand('copy')
  document.body.removeChild(textarea)
}

export default function App() {
  const [transcript, setTranscript] = useState('')

  const [ollamaUrl, setOllamaUrl] = useState(() => localStorage.getItem(LS_OLLAMA_URL) || DEFAULT_OLLAMA_URL)
  const [model, setModel] = useState(() => localStorage.getItem(LS_MODEL) || DEFAULT_MODEL)

  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isTestingConn, setIsTestingConn] = useState(false)
  const [connStatus, setConnStatus] = useState<string | null>(null)

  const [isRunning, setIsRunning] = useState(false)
  const [tokenCount, setTokenCount] = useState(0)
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [rawDebug, setRawDebug] = useState<string | null>(null)

  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)

  useEffect(() => {
    localStorage.setItem(LS_OLLAMA_URL, ollamaUrl)
  }, [ollamaUrl])

  useEffect(() => {
    localStorage.setItem(LS_MODEL, model)
  }, [model])

  async function handleTestConnection() {
    setIsTestingConn(true)
    setConnStatus(null)
    try {
      const result = await testConnection(ollamaUrl, model)
      if (!result.ok) {
        setConnStatus('Cannot connect')
      } else if (!result.modelAvailable) {
        setConnStatus(`Connected, but "${model}" is not installed`)
      } else {
        setConnStatus('Connected')
      }
    } finally {
      setIsTestingConn(false)
    }
  }

  async function handleRunAnalysis() {
    const trimmed = transcript.trim()
    if (!trimmed) {
      setError('Please paste a supervisor transcript before running analysis.')
      return
    }

    setError(null)
    setRawDebug(null)
    setAnalysis(null)
    setTokenCount(0)
    setIsRunning(true)
    try {
      const raw = await generateAnalysis({
        model,
        transcriptText: trimmed,
        onToken: (assembled) => setTokenCount(assembled.length),
      })

      const parsed = parseAnalysis(raw)
      if (!parsed) {
        setRawDebug(JSON.stringify(raw, null, 2))
        setError('The model returned a response but it did not match the expected schema. Check the browser console (F12 → Console) for exactly which field failed. The raw output is shown below.')
        return
      }

      setAnalysis(parsed)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      const looksLikeMissingModel = msg.includes('(404)')

      if (looksLikeMissingModel) {
        setError(`Ollama responded, but the selected model "${model}" is not available. Pull it with: ollama pull ${model}`)
      } else {
        setError(msg)
      }
    } finally {
      setIsRunning(false)
    }
  }

  const evidenceCount = analysis?.evidence.length ?? 0
  const gapsCount = analysis?.gaps.length ?? 0
  const questionsCount = analysis?.followUpQuestions.length ?? 0

  const kpiRows = useMemo(() => analysis?.kpiMapping ?? [], [analysis])

  return (
    <div className="trinethra-root">
      <div className="layout">
        <aside className="left-panel">
          <div className="left-header">
            <div>
              <div className="app-title">Trinethra</div>
              <div className="app-subtitle">Supervisor Feedback Analyzer</div>
            </div>
            <button
              type="button"
              className="icon-button"
              aria-label="Settings"
              onClick={() => setIsSettingsOpen(true)}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path
                  d="M12 15.5C13.933 15.5 15.5 13.933 15.5 12C15.5 10.067 13.933 8.5 12 8.5C10.067 8.5 8.5 10.067 8.5 12C8.5 13.933 10.067 15.5 12 15.5Z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M19.4 15C19.65 14.3 19.8 13.6 19.86 12.9L21 12C21 12 20.1 10.6 19.86 9.1C19.8 8.4 19.65 7.7 19.4 7L21 5L19 3L17.1 4.6C16.4 4.35 15.7 4.2 15 4.14L14.1 3H9.9L9 4.14C8.3 4.2 7.6 4.35 6.9 4.6L5 3L3 5L4.6 7C4.35 7.7 4.2 8.4 4.14 9.1C3.9 10.6 3 12 3 12L4.14 12.9C4.2 13.6 4.35 14.3 4.6 15L3 17L5 19L6.9 17.4C7.6 17.65 8.3 17.8 9 17.86L9.9 21H14.1L15 17.86C15.7 17.8 16.4 17.65 17.1 17.4L19 19L21 17L19.4 15Z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>

          <div className="field">
            <div className="field-label">Supervisor Transcript</div>
            <textarea
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              className="transcript-textarea"
              placeholder="Paste the supervisor call transcript here..."
              minLength={1}
            />
          </div>

          <div className="controls-row">
            <div className="controls-stack">
              <div className="settings-row">
                <label className="mini-label">
                  Ollama URL
                  <input
                    className="mini-input"
                    value={ollamaUrl}
                    onChange={(e) => setOllamaUrl(e.target.value)}
                    placeholder={DEFAULT_OLLAMA_URL}
                  />
                </label>
                <label className="mini-label">
                  Model
                  <input className="mini-input" list="model-options" value={model} onChange={(e) => setModel(e.target.value)} />
                </label>
              </div>

              <button type="button" className="run-button" onClick={handleRunAnalysis} disabled={isRunning}>
                {isRunning ? (
                  <span className="run-content">
                    <span className="spinner" aria-hidden="true" />
                    {tokenCount > 0 ? `Generating… ${tokenCount} chars` : 'Connecting…'}
                  </span>
                ) : (
                  'Run Analysis'
                )}
              </button>
            </div>
          </div>
        </aside>

        <main className="right-panel">
          {error ? (
            <div className="inline-error">
              <div className="inline-error-title">Error</div>
              <div className="inline-error-message">{error}</div>
              {rawDebug ? (
                <details className="raw-debug">
                  <summary>Show raw model output</summary>
                  <pre className="raw-debug-pre">{rawDebug}</pre>
                </details>
              ) : null}
              <button type="button" className="inline-error-close" onClick={() => { setError(null); setRawDebug(null) }} aria-label="Dismiss">
                ×
              </button>
            </div>
          ) : null}

          {!analysis && !error ? <div className="empty-state">Run an analysis to see results here</div> : null}

          {analysis ? (
            <div className="results">
              <section className="score-card-wrap">
                <div className={`score-card band-${bandKey(analysis.score.band)}`}>
                  <div className="score-top">
                    <div className="score-value">{analysis.score.value} / 10</div>
                    <div className="score-meta">
                      <div className="score-label">{analysis.score.label}</div>
                      <div className="score-band">{analysis.score.band} Band</div>
                      <div className={`confidence-badge conf-${analysis.score.confidence}`}>
                        {analysis.score.confidence === 'high'
                          ? 'High confidence'
                          : analysis.score.confidence === 'low'
                            ? 'Low confidence'
                            : 'Medium confidence'}
                      </div>
                    </div>
                  </div>
                  <p className="score-justification">{analysis.score.justification}</p>
                </div>
              </section>

              <details className="collapsible" open>
                <summary>Evidence from Transcript ({evidenceCount})</summary>
                <div className="collapsible-body">
                  <div className="cards-grid">
                    {analysis.evidence.map((ev, idx) => (
                      <div className="evidence-card" key={idx}>
                        <div className="tag-row">
                          <span className={`signal-tag signal-${ev.signal}`}>
                            {ev.signal === 'positive' ? 'Positive' : ev.signal === 'negative' ? 'Negative' : 'Neutral'}
                          </span>
                          <span className="dimension-tag">{dimensionLabel[ev.dimension]}</span>
                        </div>
                        <div className="evidence-quote">
                          <em>"{ev.quote}"</em>
                        </div>
                        <div className="evidence-interpretation">{ev.interpretation}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </details>

              <details className="collapsible" open>
                <summary>KPI Impact</summary>
                <div className="collapsible-body">
                  {kpiRows.length === 0 ? (
                    <div className="muted">No KPI connections identified in this transcript</div>
                  ) : (
                    <div className="kpi-rows">
                      {kpiRows.map((row, idx) => (
                        <div className="kpi-row" key={idx}>
                          <div className="kpi-main">
                            <div className="kpi-name">{row.kpi}</div>
                            <div className="kpi-evidence muted">{row.evidence}</div>
                          </div>
                          <div className={`kpi-badge ${row.systemOrPersonal === 'system' ? 'badge-system' : 'badge-personal'}`}>
                            {row.systemOrPersonal === 'system' ? 'System' : 'Personal'}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </details>

              <details className="collapsible" open>
                <summary>Gaps Identified ({gapsCount})</summary>
                <div className="collapsible-body">
                  <div className="gap-rows">
                    {analysis.gaps.map((gap, idx) => (
                      <div className="gap-row" key={idx}>
                        <div className="gap-icon" aria-hidden="true">
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                            <path
                              d="M12 9V13"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                            <path
                              d="M12 17H12.01"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                            <path
                              d="M10.3 4.2L2.8 18.3C2.3 19.2 3 20.2 4 20.2H20C21 20.2 21.7 19.2 21.2 18.3L13.7 4.2C13.2 3.4 10.8 3.4 10.3 4.2Z"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </div>
                        <div className="gap-body">
                          <div className="gap-title">{dimensionLabel[gap.dimension]}</div>
                          <div className="gap-detail muted">{gap.detail}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </details>

              <details className="collapsible" open>
                <summary>Suggested Follow-up Questions ({questionsCount})</summary>
                <div className="collapsible-body">
                  <div className="question-list">
                    {analysis.followUpQuestions.map((q, idx) => (
                      <div className="question-card" key={idx}>
                        <div className="question-top">
                          <div className="question-number">{idx + 1}.</div>
                          <div className="question-text">{q.question}</div>
                          <button
                            type="button"
                            className="copy-button"
                            onClick={async () => {
                              await safeCopy(q.question)
                              setCopiedIndex(idx)
                              setTimeout(() => setCopiedIndex((prev) => (prev === idx ? null : prev)), 900)
                            }}
                          >
                            {copiedIndex === idx ? 'Copied' : 'Copy'}
                          </button>
                        </div>
                        <div className="question-meta">
                          <div className="question-line">
                            <span className="question-meta-label">Targeting:</span> {dimensionLabel[q.targetGap]}
                          </div>
                          <div className="question-line">
                            <span className="question-meta-label">Looking for:</span> {q.lookingFor}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </details>
            </div>
          ) : null}
        </main>
      </div>

      {isSettingsOpen ? (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Settings"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setIsSettingsOpen(false)
          }}
        >
          <div className="modal">
            <div className="modal-header">
              <div className="modal-title">Settings</div>
              <button type="button" className="modal-close" onClick={() => setIsSettingsOpen(false)} aria-label="Close">
                ×
              </button>
            </div>

            <div className="modal-body">
              <label className="modal-label">
                Ollama URL
                <input className="modal-input" value={ollamaUrl} onChange={(e) => setOllamaUrl(e.target.value)} />
              </label>

              <label className="modal-label">
                Model
                <input className="modal-input" list="model-options" value={model} onChange={(e) => setModel(e.target.value)} />
              </label>

              <button type="button" className="test-button" onClick={handleTestConnection} disabled={isTestingConn}>
                {isTestingConn ? (
                  <span className="run-content">
                    <span className="spinner" aria-hidden="true" />
                    Testing...
                  </span>
                ) : (
                  'Test Connection'
                )}
              </button>

              {connStatus ? <div className={`conn-status ${connStatus === 'Connected' ? 'ok' : 'bad'}`}>{connStatus}</div> : null}
              <div className="modal-hint muted">If browser CORS blocks access to Ollama, connection tests may fail.</div>
            </div>
          </div>
        </div>
      ) : null}

      <datalist id="model-options">
        <option value="qwen2.5:7b" />
        <option value="llama3.2" />
        <option value="mistral" />
      </datalist>
    </div>
  )
}

