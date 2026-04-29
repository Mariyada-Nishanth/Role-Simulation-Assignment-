/**
 * Trinethra backend — Express server
 *
 * Sits between the React frontend and Ollama so the browser never calls
 * Ollama directly.  This removes the CORS problem entirely and gives us
 * a real place to add logging, auth, retries, or multi-model routing
 * in the future.
 *
 * Endpoints:
 *   GET  /api/models          — list models available on the Ollama server
 *   POST /api/analyze         — stream an analysis back to the browser
 */

import express from 'express'
import { readFileSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { createServer } from 'http'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ─── Load .env.local ─────────────────────────────────────────────────────────
// Node doesn't load .env files automatically. We parse .env.local manually
// so the server picks up VITE_OLLAMA_URL without requiring dotenv as a dep.

const envPath = join(__dirname, '..', '.env.local')
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue
    const key = trimmed.slice(0, eqIdx).trim()
    const val = trimmed.slice(eqIdx + 1).trim()
    if (!(key in process.env)) process.env[key] = val
  }
}

// ─── Config ──────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3001
const OLLAMA_URL = (process.env.VITE_OLLAMA_URL || 'http://localhost:11434').replace(/\/+$/, '')

// Load the system prompt from the compiled source location. During dev
// (ts-source) we read the .ts file and strip the export boilerplate.
// This keeps the prompt in one canonical file.
function loadSystemPrompt() {
  const tsPath = join(__dirname, '..', 'src', 'lib', 'systemPrompt.ts')
  const raw = readFileSync(tsPath, 'utf8')
  // Extract the string between the first backtick pair after `SYSTEM_PROMPT =`
  const match = raw.match(/SYSTEM_PROMPT\s*=\s*`([\s\S]*?)`\s*;?\s*$/)
  if (!match) throw new Error('Could not parse SYSTEM_PROMPT from systemPrompt.ts')
  return match[1]
}

const SYSTEM_PROMPT = loadSystemPrompt()

// ─── App ─────────────────────────────────────────────────────────────────────

const app = express()
app.use(express.json({ limit: '1mb' }))

// Basic request logger
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`)
  next()
})

// ─── GET /api/models ─────────────────────────────────────────────────────────
// Returns the list of models available on the configured Ollama server.

app.get('/api/models', async (_req, res) => {
  try {
    const response = await fetch(`${OLLAMA_URL}/api/tags`)
    if (!response.ok) {
      return res.status(502).json({ error: `Ollama returned ${response.status}` })
    }
    const data = await response.json()
    res.json(data)
  } catch (err) {
    console.error('[/api/models]', err)
    res.status(502).json({ error: 'Cannot reach Ollama. Check VITE_OLLAMA_URL.' })
  }
})

// ─── POST /api/analyze ───────────────────────────────────────────────────────
// Accepts { model, transcript } and streams the Ollama response back to the
// browser as newline-delimited JSON chunks (same format Ollama uses natively).

app.post('/api/analyze', async (req, res) => {
  const { model, transcript } = req.body

  if (!model || typeof model !== 'string') {
    return res.status(400).json({ error: 'model is required' })
  }
  if (!transcript || typeof transcript !== 'string' || !transcript.trim()) {
    return res.status(400).json({ error: 'transcript is required' })
  }

  const payload = {
    model,
    system: SYSTEM_PROMPT,
    prompt: transcript.trim(),
    stream: true,
    options: { temperature: 0 },
    format: 'json',
  }

  let ollamaRes
  try {
    ollamaRes = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  } catch (err) {
    console.error('[/api/analyze] fetch error', err)
    return res.status(502).json({ error: 'Cannot reach Ollama. Check VITE_OLLAMA_URL.' })
  }

  if (!ollamaRes.ok) {
    const text = await ollamaRes.text().catch(() => '')
    console.error('[/api/analyze] Ollama error', ollamaRes.status, text.slice(0, 200))
    return res.status(ollamaRes.status).json({ error: `Ollama responded with ${ollamaRes.status}` })
  }

  // Stream the Ollama response directly to the browser.
  // Each chunk is a JSON line; the browser accumulates the `response` fields.
  res.setHeader('Content-Type', 'application/x-ndjson')
  res.setHeader('Transfer-Encoding', 'chunked')
  res.setHeader('Cache-Control', 'no-cache')

  const reader = ollamaRes.body.getReader()
  const pump = async () => {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      res.write(value)
    }
    res.end()
  }

  pump().catch((err) => {
    console.error('[/api/analyze] stream error', err)
    res.end()
  })
})

// ─── Health check ─────────────────────────────────────────────────────────────

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', ollamaUrl: OLLAMA_URL })
})

// ─── Start ────────────────────────────────────────────────────────────────────

const server = createServer(app)

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n[backend] ERROR: Port ${PORT} is already in use.`)
    console.error(`[backend] Kill the existing process and restart:\n`)
    console.error(`  Windows:  netstat -ano | findstr :${PORT}  → Stop-Process -Id <PID> -Force`)
    console.error(`  Mac/Linux: lsof -ti :${PORT} | xargs kill\n`)
    process.exit(1)
  }
  throw err
})

server.listen(PORT, () => {
  console.log(`Trinethra backend running on http://localhost:${PORT}`)
  console.log(`Ollama target: ${OLLAMA_URL}`)
})
