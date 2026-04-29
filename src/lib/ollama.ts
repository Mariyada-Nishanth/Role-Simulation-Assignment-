import { SYSTEM_PROMPT } from './systemPrompt'

function normalizeOllamaUrl(ollamaUrl: string) {
  return ollamaUrl.replace(/\/+$/, '')
}

/**
 * Returns the API base to use for browser fetch calls.
 *
 * Remote URLs are routed through the Vite /ollama proxy so the browser
 * always calls the same origin and CORS never fires.
 *
 * Localhost URLs are called directly (Ollama allows them by default).
 */
function resolveApiBase(ollamaUrl: string): string {
  const normalized = normalizeOllamaUrl(ollamaUrl)
  const isLocalhost =
    normalized.includes('localhost') || normalized.includes('127.0.0.1') || normalized.includes('::1')
  if (isLocalhost) return normalized
  return '/ollama'
}

export type GenerateAnalysisArgs = {
  ollamaUrl: string
  model: string
  transcriptText: string
  onToken?: (assembled: string) => void
}

export type ConnectionResult = {
  ok: boolean
  modelAvailable: boolean
}

/**
 * Sends a transcript to Ollama using streaming so the connection stays alive
 * through Cloudflare and other proxies that timeout on idle connections.
 *
 * Ollama sends newline-delimited JSON chunks:
 *   {"response":"partial token","done":false}
 *   ...
 *   {"response":"","done":true}
 *
 * We concatenate every `response` field and parse the full JSON at the end.
 * The optional `onToken` callback receives the assembled text so far so the
 * UI can show a live progress indicator.
 */
export async function generateAnalysis(args: GenerateAnalysisArgs): Promise<unknown> {
  const baseUrl = resolveApiBase(args.ollamaUrl)
  const controller = new AbortController()

  let res: Response
  try {
    res = await fetch(`${baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model: args.model,
        system: SYSTEM_PROMPT,
        prompt: args.transcriptText,
        stream: true,
        options: { temperature: 0 },
        format: 'json',
      }),
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('Analysis cancelled.')
    }
    throw new Error('Could not reach Ollama. Check the URL and make sure Ollama is running.')
  }

  if (!res.ok) {
    throw new Error(`Ollama request failed (${res.status})`)
  }

  if (!res.body) {
    throw new Error('Ollama returned no response body.')
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let assembled = ''
  let leftover = ''

  // Idle watchdog — reset on every incoming chunk. If 3 minutes pass with no
  // data the model has likely crashed or the connection silently dropped.
  let idleTimer = window.setTimeout(() => controller.abort(), 3 * 60 * 1000)

  function resetIdle() {
    window.clearTimeout(idleTimer)
    idleTimer = window.setTimeout(() => controller.abort(), 3 * 60 * 1000)
  }

  try {
    while (true) {
      let done: boolean
      let value: Uint8Array | undefined
      try {
        ;({ done, value } = await reader.read())
      } catch {
        throw new Error('Connection lost while receiving response from Ollama.')
      }

      if (done) break
      resetIdle()

      const chunk = leftover + decoder.decode(value, { stream: true })
      const lines = chunk.split('\n')
      leftover = lines.pop() ?? ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue
        let parsed: any
        try {
          parsed = JSON.parse(trimmed)
        } catch {
          continue
        }
        if (typeof parsed?.response === 'string') {
          assembled += parsed.response
          args.onToken?.(assembled)
        }
        if (parsed?.done === true) break
      }
    }
  } finally {
    window.clearTimeout(idleTimer)
    reader.releaseLock()
  }

  if (!assembled) {
    throw new Error('Ollama returned an empty response.')
  }

  console.log('[ollama] Raw assembled response (%d chars):', assembled.length, assembled)

  // Direct parse first.
  try {
    return JSON.parse(assembled)
  } catch (directErr) {
    console.warn('[ollama] Direct JSON.parse failed:', directErr)
  }

  // Fallback: extract the outermost {...} block in case the model wrapped the
  // JSON in markdown fences (```json ... ```) or added commentary around it.
  const jsonStart = assembled.indexOf('{')
  const jsonEnd = assembled.lastIndexOf('}')
  if (jsonStart !== -1 && jsonEnd > jsonStart) {
    const extracted = assembled.slice(jsonStart, jsonEnd + 1)
    console.log('[ollama] Trying extracted JSON (%d chars):', extracted.length, extracted)
    try {
      return JSON.parse(extracted)
    } catch (extractErr) {
      console.warn('[ollama] Extracted JSON.parse also failed:', extractErr)
    }
  }

  throw new Error('Ollama returned malformed JSON. Try running again.')
}

export async function testConnection(ollamaUrl: string, model: string): Promise<ConnectionResult> {
  const baseUrl = resolveApiBase(ollamaUrl)
  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), 20_000)
  try {
    const res = await fetch(`${baseUrl}/api/tags`, { method: 'GET', signal: controller.signal })
    if (!res.ok) return { ok: false, modelAvailable: false }

    const data: any = await res.json()
    const models = Array.isArray(data?.models) ? data.models : []
    const modelAvailable = models.some((item: any) => {
      const name = typeof item?.name === 'string' ? item.name : ''
      const modelName = typeof item?.model === 'string' ? item.model : ''
      return name === model || modelName === model || name.startsWith(`${model}:`) || modelName.startsWith(`${model}:`)
    })

    return { ok: true, modelAvailable }
  } catch {
    return { ok: false, modelAvailable: false }
  } finally {
    window.clearTimeout(timeoutId)
  }
}
