/**
 * Browser-side Ollama client.
 *
 * Calls the Express backend (port 3001) directly instead of going through
 * the Vite dev proxy. The Vite proxy buffers streaming responses before
 * forwarding them, which means the browser would see nothing until the entire
 * LLM response is complete — defeating the purpose of streaming.
 *
 * Express has CORS enabled for localhost origins, so direct cross-origin calls
 * from the Vite dev server (port 5173) are allowed.
 */

const BACKEND = 'http://localhost:3001'

export type GenerateAnalysisArgs = {
  model: string
  transcriptText: string
  onToken?: (assembled: string) => void
}

export type ConnectionResult = {
  ok: boolean
  modelAvailable: boolean
}

/**
 * Sends a transcript to the backend /api/analyze endpoint.
 * The response is a streaming newline-delimited JSON from Ollama (forwarded
 * by Express). We accumulate the `response` field from each chunk and return
 * the final assembled text parsed as JSON.
 */
export async function generateAnalysis(args: GenerateAnalysisArgs): Promise<unknown> {
  const controller = new AbortController()

  let res: Response
  try {
    res = await fetch(`${BACKEND}/api/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({ model: args.model, transcript: args.transcriptText }),
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('Analysis cancelled.')
    }
    throw new Error('Could not reach the backend server. Make sure it is running on port 3001.')
  }

  if (!res.ok) {
    let detail = ''
    try { detail = (await res.json()).error ?? '' } catch { /* ignore */ }
    if (res.status === 400) throw new Error(`Bad request: ${detail}`)
    if (res.status === 404) throw new Error(`Model not found on Ollama: ${detail}`)
    throw new Error(`Backend error (${res.status})${detail ? `: ${detail}` : ''}`)
  }

  if (!res.body) throw new Error('No response body from backend.')

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let assembled = ''
  let leftover = ''

  // Idle watchdog — if no token arrives for 3 minutes, abort.
  let idleTimer = window.setTimeout(() => controller.abort(), 3 * 60 * 1000)
  const resetIdle = () => {
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
        throw new Error('Connection lost while receiving response from backend.')
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
        try { parsed = JSON.parse(trimmed) } catch { continue }
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

  if (!assembled) throw new Error('Backend returned an empty response.')

  console.log('[ollama] Raw assembled response (%d chars):', assembled.length, assembled)

  try {
    return JSON.parse(assembled)
  } catch (directErr) {
    console.warn('[ollama] Direct JSON.parse failed:', directErr)
  }

  // Fallback: extract the outermost {...} block in case of surrounding text.
  const jsonStart = assembled.indexOf('{')
  const jsonEnd = assembled.lastIndexOf('}')
  if (jsonStart !== -1 && jsonEnd > jsonStart) {
    const extracted = assembled.slice(jsonStart, jsonEnd + 1)
    console.log('[ollama] Trying extracted JSON (%d chars):', extracted.length, extracted)
    try { return JSON.parse(extracted) } catch (extractErr) {
      console.warn('[ollama] Extracted JSON.parse also failed:', extractErr)
    }
  }

  throw new Error('Ollama returned malformed JSON. Try running again.')
}

/**
 * Pings /api/models (backend → Ollama /api/tags) and checks if the
 * configured model is installed.
 */
export async function testConnection(_ollamaUrl: string, model: string): Promise<ConnectionResult> {
  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), 20_000)
  try {
    const res = await fetch(`${BACKEND}/api/models`, { signal: controller.signal })
    if (!res.ok) return { ok: false, modelAvailable: false }

    const data: any = await res.json()
    const models = Array.isArray(data?.models) ? data.models : []
    const modelAvailable = models.some((item: any) => {
      const name = typeof item?.name === 'string' ? item.name : ''
      const modelName = typeof item?.model === 'string' ? item.model : ''
      return name === model || modelName === model
        || name.startsWith(`${model}:`) || modelName.startsWith(`${model}:`)
    })

    return { ok: true, modelAvailable }
  } catch {
    return { ok: false, modelAvailable: false }
  } finally {
    window.clearTimeout(timeoutId)
  }
}
