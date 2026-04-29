import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')

const DEFAULT_INPUT = path.resolve(projectRoot, '..', 'softwaredeveloper', 'sample-transcripts.json')
const DEFAULT_OUTPUT = path.resolve(projectRoot, 'batch-results')
const DEFAULT_OLLAMA_URL = 'https://llmreq.kaaty.online'
const DEFAULT_MODEL = 'qwen2.5:7b'

function getArg(name, fallback) {
  const prefix = `--${name}=`
  const found = process.argv.find((arg) => arg.startsWith(prefix))
  return found ? found.slice(prefix.length) : fallback
}

function normalizeOllamaUrl(url) {
  return url.replace(/\/+$/, '')
}

async function loadSystemPrompt() {
  const promptPath = path.resolve(projectRoot, '..', 'softwaredeveloper', 'system-prompt.md')
  const markdown = await readFile(promptPath, 'utf8')
  const marker = '## System Prompt'
  const index = markdown.indexOf(marker)
  if (index === -1) return markdown.trim()
  return markdown.slice(index + marker.length).trim()
}

async function loadTranscripts(inputPath) {
  const raw = JSON.parse(await readFile(inputPath, 'utf8'))

  if (Array.isArray(raw)) {
    return raw.map((item, index) => ({
      id: item.id || `transcript-${index + 1}`,
      transcript: String(item.transcript ?? item.text ?? item),
      metadata: item,
    }))
  }

  if (Array.isArray(raw.transcripts)) {
    return raw.transcripts.map((item, index) => ({
      id: item.id || `transcript-${index + 1}`,
      transcript: String(item.transcript),
      metadata: item,
    }))
  }

  if (typeof raw.transcript === 'string') {
    return [{ id: raw.id || 'transcript-1', transcript: raw.transcript, metadata: raw }]
  }

  throw new Error('Input must be an array, an object with transcripts[], or an object with transcript.')
}

async function generateAnalysis({ ollamaUrl, model, systemPrompt, transcript }) {
  const res = await fetch(`${normalizeOllamaUrl(ollamaUrl)}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      system: systemPrompt,
      prompt: transcript,
      stream: false,
      options: { temperature: 0 },
      format: 'json',
    }),
  })

  const bodyText = await res.text()
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${bodyText}`)
  }

  const body = JSON.parse(bodyText)
  if (typeof body.response !== 'string') {
    throw new Error('Ollama response did not include a string response field.')
  }

  return JSON.parse(body.response)
}

async function main() {
  const inputPath = path.resolve(projectRoot, getArg('input', DEFAULT_INPUT))
  const outputDir = path.resolve(projectRoot, getArg('output', DEFAULT_OUTPUT))
  const ollamaUrl = getArg('ollama-url', process.env.OLLAMA_URL || DEFAULT_OLLAMA_URL)
  const model = getArg('model', process.env.OLLAMA_MODEL || DEFAULT_MODEL)

  await mkdir(outputDir, { recursive: true })

  const systemPrompt = await loadSystemPrompt()
  const transcripts = await loadTranscripts(inputPath)

  console.log(`Batch analyzing ${transcripts.length} transcript(s)`)
  console.log(`Ollama URL: ${ollamaUrl}`)
  console.log(`Model: ${model}`)
  console.log(`Output: ${outputDir}`)

  const summary = []

  for (const [index, item] of transcripts.entries()) {
    const startedAt = Date.now()
    const safeId = String(item.id).replace(/[^a-z0-9_-]+/gi, '-')
    const outputPath = path.join(outputDir, `${safeId}.json`)

    console.log(`\n[${index + 1}/${transcripts.length}] ${item.id}...`)

    try {
      const analysis = await generateAnalysis({
        ollamaUrl,
        model,
        systemPrompt,
        transcript: item.transcript,
      })

      await writeFile(
        outputPath,
        JSON.stringify(
          {
            id: item.id,
            metadata: item.metadata,
            analysis,
          },
          null,
          2,
        ),
      )

      const elapsedSeconds = ((Date.now() - startedAt) / 1000).toFixed(1)
      console.log(`Saved ${outputPath} (${elapsedSeconds}s)`)
      summary.push({ id: item.id, ok: true, outputPath, elapsedSeconds: Number(elapsedSeconds) })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const errorPath = path.join(outputDir, `${safeId}.error.json`)
      await writeFile(errorPath, JSON.stringify({ id: item.id, error: message }, null, 2))
      console.error(`Failed ${item.id}: ${message}`)
      summary.push({ id: item.id, ok: false, errorPath, error: message })
    }
  }

  await writeFile(path.join(outputDir, 'summary.json'), JSON.stringify(summary, null, 2))
  console.log('\nBatch complete. See summary.json for results.')
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})

