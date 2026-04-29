# Trinethra — Supervisor Feedback Analyzer

Trinethra is a local web app for DeepThought psychology interns. Interns paste a supervisor feedback transcript, send it to a locally running Ollama model, and review a structured draft analysis covering score, evidence, KPI mapping, gaps, and follow-up questions.

## Tech Stack

- React + TypeScript
- Vite
- Browser-to-Ollama API calls, with no backend/proxy
- `localStorage` for Ollama URL and model settings

## Model Choice

The default model is `qwen2.5:7b`.

I chose it because it is strong enough for structured extraction and rubric reasoning while still being practical to run locally on many laptops. The app also suggests `llama3.2` and `mistral`, and the model field accepts any locally pulled Ollama model name.

## Setup

1. Install Ollama from `https://ollama.com`.

2. Pull the default model:

```bash
ollama pull qwen2.5:7b
```

Optional alternative models:

```bash
ollama pull llama3.2
ollama pull mistral
```

3. Start Ollama. It usually runs as a background service after installation. You can test it with:

```bash
ollama run qwen2.5:7b "Hello"
```

4. Install app dependencies:

```bash
npm install
```

5. Run the app:

```bash
npm run dev
```

6. Open the local Vite URL shown in the terminal, usually:

```text
http://localhost:5173
```

## Browser Access / CORS Note

This assignment intentionally uses no backend. The browser calls Ollama directly at:

```text
http://localhost:11434/api/generate
```

If the app cannot connect but Ollama is running, the browser may be blocking the request because of CORS. On Windows, set an allowed origin environment variable, quit Ollama, and restart it.

Use the exact Vite URL shown in your terminal. If Vite runs on `http://localhost:5173`, use:

```powershell
setx OLLAMA_ORIGINS "http://localhost:5173"
```

If Vite chooses another port, replace `5173` with that port.

For local development only, you can use:

```powershell
setx OLLAMA_ORIGINS "*"
```

After setting the variable, fully quit Ollama from the system tray and reopen it.

If you use a remote HTTPS Ollama URL and see a browser console error like:

```text
Access to fetch ... has been blocked by CORS policy
```

the model server is reachable, but the browser is refusing to expose the response to the app. The server must send `Access-Control-Allow-Origin`, or you should use the batch script below.

## CPU-Friendly Batch Processing

On CPU-only machines, long transcript analysis may be slow. Instead of keeping the browser waiting, run the batch script from the terminal. It processes transcripts one by one and saves JSON files to `batch-results/`.

Process the provided sample transcripts:

```bash
npm run batch
```

Use a custom server/model:

```bash
npm run batch -- --ollama-url=https://llmreq.kaaty.online --model=qwen2.5:7b
```

Use a custom input/output:

```bash
npm run batch -- --input=../softwaredeveloper/sample-transcripts.json --output=batch-results
```

The batch script uses the same strict JSON request shape:

```json
{
  "stream": false,
  "options": { "temperature": 0 },
  "format": "json"
}
```

## How It Works

1. The intern pastes a supervisor transcript.
2. The app sends this payload to Ollama:

```json
{
  "model": "qwen2.5:7b",
  "system": "SYSTEM_PROMPT",
  "prompt": "transcript text",
  "stream": false,
  "options": { "temperature": 0 },
  "format": "json"
}
```

3. The app parses `response.response` as JSON.
4. A lightweight validator checks the expected schema.
5. The right panel renders:
   - Score
   - Evidence from Transcript
   - KPI Impact
   - Gaps Identified
   - Suggested Follow-up Questions

## Design Challenges Tackled

### Structured Output Reliability

The app requests Ollama JSON mode with `format: "json"` and `temperature: 0`. It also validates the returned object before rendering. If the model returns malformed or incomplete output, the app shows a clear dismissible error instead of crashing.

### Showing Uncertainty

The UI presents the model output as a draft review artifact, not a final decision. It includes a confidence badge, evidence cards, gap analysis, and follow-up questions so the intern can challenge the model's conclusion.

### Gap Detection

The system prompt explicitly checks four dimensions: execution, systems building, KPI impact, and change management. Missing dimensions become follow-up questions rather than hidden assumptions.

## Project Structure

```text
src/
  App.tsx                  Main analyzer UI
  styles.css               App styling and responsive layout
  lib/
    systemPrompt.ts        DeepThought analysis prompt
    ollama.ts              Browser Ollama API client
    analysisTypes.ts       TypeScript output schema
    parseAnalysis.ts       Runtime validation and normalization
```

## What I Would Improve With More Time

- Add side-by-side quote highlighting so interns can click an evidence quote and jump to its location in the transcript.
- Add an edit/review workflow where interns can accept, reject, or rewrite individual findings.
- Add sample transcript buttons for faster evaluator testing.
- Add a second-pass repair prompt if the model returns invalid JSON.

