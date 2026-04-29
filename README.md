# Trinethra — Supervisor Feedback Analyzer

A web app for DeepThought psychology interns. Paste a supervisor feedback transcript, send it to a locally or remotely running Ollama model, and get a structured draft analysis covering score, evidence, KPI mapping, gaps, and follow-up questions.

---

## How It Works

### The flow

1. Intern pastes a supervisor transcript into the left panel
2. App sends it to Ollama as a streaming POST request with the system prompt
3. Ollama generates a structured JSON response token by token
4. App accumulates the stream, parses the final JSON, validates it against the expected schema
5. Right panel renders the analysis as five reviewable sections

### Why streaming

Ollama on a CPU can take 3–5 minutes to generate a response for a long transcript. If the request sits silent that long, Cloudflare (or any reverse proxy) will kill the connection with a 524 timeout before the response arrives. Streaming keeps the connection alive by sending tokens continuously. The browser accumulates all tokens and parses the final JSON only after the stream closes.

### The system prompt

The system prompt lives in `src/lib/systemPrompt.ts`. It teaches the model:

- What a DT Fellow is and what their two-layer mandate is (execution vs systems-building)
- The 1–10 scoring rubric with exact labels and band names
- The 6 vs 7 scoring boundary using a **surprise + unsolicited + business relevance** test, not keyword matching
- The four assessment dimensions: execution, systems_building, kpi_impact, change_management
- The eight KPIs and how to map plain supervisor language to them
- Five supervisor biases to detect and neutralize: helpfulness, presence, halo/horn, recency, dependency
- A worked example of the hardest trap (Meena at Lakshmi Textiles, 6 vs 7)
- A preflight checklist and self-consistency check the model runs before writing JSON

The output is always a draft. The intern reviews, challenges, or rejects each finding.

### The output schema

```ts
{
  score: { value, label, band, justification, confidence }
  evidence: [{ quote, signal, dimension, interpretation }]
  kpiMapping: [{ kpi, evidence, systemOrPersonal }]
  gaps: [{ dimension, detail }]
  followUpQuestions: [{ question, targetGap, lookingFor }]
}
```

### Schema validation

`src/lib/parseAnalysis.ts` validates every field before the UI renders anything. It normalizes common LLM inconsistencies (casing, underscores vs spaces, string vs number for score). If the model returns something that cannot be salvaged, it logs exactly which field failed in the browser console and shows the raw output in the error banner so you know what went wrong.

### CORS and the Vite proxy

Browsers block cross-origin fetch requests. If Ollama runs at `http://localhost:11434`, that is the same machine and CORS is not an issue. If Ollama is behind a remote HTTPS URL (e.g. a cloud server), the browser would normally be blocked.

The app routes remote requests through the Vite dev server proxy. The browser calls `/ollama/api/generate` (same origin as the app), and Vite forwards it to the configured Ollama URL. The remote server's CORS headers do not matter.

The proxy target is set in `.env.local`:

```
VITE_OLLAMA_URL=https://your-ollama-server.example.com
```

Restart `npm run dev` after changing `.env.local`.

---

## Project Structure

```
trinethra/
├── src/
│   ├── App.tsx                 Main UI — left panel input, right panel output
│   ├── styles.css              Layout, score band colours, responsive design
│   └── lib/
│       ├── systemPrompt.ts     The full analysis prompt sent to Ollama
│       ├── ollama.ts           Streaming Ollama client + connection test
│       ├── analysisTypes.ts    TypeScript schema for the expected JSON output
│       └── parseAnalysis.ts    Runtime validation, normalization, debug logging
├── scripts/
│   └── batchAnalyze.mjs        Node.js batch processor (bypasses browser entirely)
├── vite.config.ts              Vite config with CORS proxy
└── .env.local                  Your Ollama URL (gitignored)
```

---

## Setup

### 1. Install Ollama

Download from [ollama.com](https://ollama.com) and install it. Ollama runs as a background service after installation.

### 2. Pull a model

```bash
ollama pull qwen2.5:7b
```

`qwen2.5:7b` is the recommended model for this app. It handles structured JSON output and rubric reasoning well at 4-bit quantization, which runs on 8–16 GB RAM with no GPU.

### 3. Configure the Ollama URL

Create `.env.local` in the `trinethra/` folder:

```
# Local Ollama (default)
VITE_OLLAMA_URL=http://localhost:11434

# Or a remote server
VITE_OLLAMA_URL=https://your-ollama-server.example.com
```

`.env.local` is gitignored. It will not be committed.

### 4. Install dependencies

```bash
npm install
```

### 5. Run the app

```bash
npm run dev
```

Open the URL shown in the terminal, usually `http://localhost:5173`.

---

## CORS — local Ollama only

If you run Ollama locally and the browser cannot connect, Ollama may be blocking the request from the Vite origin. Fix it by setting the allowed origins before starting Ollama:

**Windows (PowerShell):**

```powershell
setx OLLAMA_ORIGINS "http://localhost:5173"
```

Then fully quit Ollama from the system tray and reopen it. Use the exact port Vite shows in the terminal.

For dev convenience you can use `*` to allow all origins:

```powershell
setx OLLAMA_ORIGINS "*"
```

**macOS / Linux:**

```bash
OLLAMA_ORIGINS="http://localhost:5173" ollama serve
```

Remote URLs do not need this — they go through the Vite proxy instead.

---

## Batch Processing (CPU machines)

If Ollama is running on a CPU-only machine (slow generation), the browser can still time out even with streaming. The batch script processes transcripts from the terminal, one at a time, with no browser involved.

```bash
# Run against the sample transcripts using defaults
npm run batch

# Use a specific server and model
npm run batch -- --ollama-url=https://your-server.example.com --model=qwen2.5:7b

# Custom input file and output directory
npm run batch -- --input=../softwaredeveloper/sample-transcripts.json --output=batch-results
```

Results are saved as individual JSON files in `batch-results/`. The folder is gitignored.

---

## Debugging

If analysis fails, open the browser console (F12 → Console). The app logs:

- `[ollama]` — the full raw text assembled from the stream, and which JSON parse attempt failed
- `[parseAnalysis]` — exactly which field in the schema was rejected and what value it received

The error banner in the UI also includes a "Show raw model output" toggle that shows the full JSON the model returned, so you can see what it actually produced without opening DevTools.

---

## What I Would Improve With More Time

- Quote highlighting — click an evidence card to jump to that quote in the transcript
- Edit/review workflow — accept, rewrite, or reject individual findings inline
- Second-pass repair — if the model returns invalid JSON, send a follow-up prompt asking it to fix the specific failing field
- Sample transcript buttons for faster testing during evaluation
