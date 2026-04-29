# Trinethra — Supervisor Feedback Analyzer

A web app for DeepThought psychology interns. Paste a supervisor feedback transcript, click Run Analysis, and get a structured draft covering score, evidence, KPI mapping, gaps, and follow-up questions — powered by a local Ollama LLM.

---

## Architecture

```
Browser (React)
      │
      │  POST /api/analyze   GET /api/models
      ▼
Express backend  (port 3001)       ← server/index.mjs
      │
      │  POST /api/generate  GET /api/tags
      ▼
Ollama  (port 11434)
      │
      ▼
qwen2.5:7b (or any pulled model)
```

The browser never talks to Ollama directly. All requests go through the Express backend, which forwards them to the configured Ollama server. This eliminates CORS entirely and gives the backend a clean place to add input validation, logging, or auth later.

The browser calls Express on port 3001 directly (not through the Vite proxy). The Vite proxy buffers streaming responses before forwarding them, which would mean the browser receives nothing until the entire LLM response is complete. Calling Express directly with CORS enabled avoids this — tokens arrive in the browser as they are generated.

---

## How It Works

### Request flow

1. Intern pastes a supervisor transcript and clicks Run Analysis
2. Frontend POSTs `{ model, transcript }` to `/api/analyze`
3. Express validates the input, attaches the system prompt, and streams the request to Ollama's `/api/generate`
4. Express pipes the Ollama stream directly back to the browser
5. Browser accumulates the streaming tokens, parses the final JSON
6. Frontend validates the JSON against the expected schema and renders the five analysis sections

### Why streaming

Ollama on a CPU can take 3–5 minutes to finish a transcript. Without streaming, any proxy (Cloudflare, nginx) will kill the idle connection with a timeout error before Ollama responds. Streaming sends tokens continuously — the connection stays alive, and the UI shows a live character count so the intern knows the model is working.

### The system prompt

Lives in `src/lib/systemPrompt.ts`. The Express backend reads it at startup — there is one canonical copy, used by both the server and (if needed) the batch script.

The prompt teaches the model:

- The DT Fellow mandate: Layer 1 execution vs Layer 2 systems-building
- The 1–10 scoring rubric with exact labels and band names
- The **surprise + unsolicited + business relevance** test for the critical 6 vs 7 boundary
- Four assessment dimensions: execution, systems_building, kpi_impact, change_management
- Eight KPIs and how to map plain supervisor language to them
- Five supervisor biases to detect: helpfulness, presence, halo/horn, recency, dependency
- A worked example of the hardest scoring trap (Meena at Lakshmi Textiles)
- A preflight checklist and self-consistency check the model runs before writing JSON

### Schema validation

`src/lib/parseAnalysis.ts` validates and normalizes every field before the UI renders. It handles common LLM inconsistencies — casing variation, underscores vs spaces, string instead of number for score. If a field fails, it logs exactly which field and what value it received in the browser console, and shows the raw output in the error banner.

---

## Project Structure

```
trinethra/
├── server/
│   └── index.mjs              Express backend — /api/analyze, /api/models, /api/health
├── src/
│   ├── App.tsx                Main UI — left panel input, right panel output
│   ├── styles.css             Layout, score band colours, responsive design
│   └── lib/
│       ├── systemPrompt.ts    The full analysis prompt (read by backend at startup)
│       ├── ollama.ts          Browser API client — calls /api/* on the backend
│       ├── analysisTypes.ts   TypeScript schema for the expected JSON output
│       └── parseAnalysis.ts   Runtime validation, normalization, debug logging
├── scripts/
│   └── batchAnalyze.mjs       Node.js batch processor (no browser needed)
├── vite.config.ts             Vite dev server — proxies /api → Express on port 3001
└── .env.local                 Ollama URL config (gitignored)
```

---

## Model Choice

`qwen2.5:7b` — chosen because it handles structured JSON extraction and multi-step rubric reasoning well at 4-bit quantization (Q4_K_M), which Ollama uses by default. It runs on 8–16 GB RAM with no GPU. The model field accepts any Ollama model name.

---

## Setup

### 1. Install Ollama

Download from [ollama.com](https://ollama.com). It runs as a background service after installation.

### 2. Pull a model

```bash
ollama pull qwen2.5:7b
```

### 3. Configure the Ollama URL

Create `.env.local` in the `trinethra/` folder:

```
# Local Ollama
VITE_OLLAMA_URL=http://localhost:11434

# Or a remote server
VITE_OLLAMA_URL=https://your-ollama-server.example.com
```

`.env.local` is gitignored.

### 4. Install dependencies

```bash
npm install
```

### 5. Start the app

```bash
npm run dev
```

This starts both the Express backend (port 3001) and the Vite frontend (port 5173) with a single command. Open the Vite URL shown in the terminal.

---

## CORS — local Ollama only

When Ollama runs locally and the backend also runs locally, no CORS configuration is needed. The backend talks to Ollama server-to-server.

If you run Ollama as a standalone service and the backend cannot reach it, set the allowed origins on the Ollama side:

**Windows:**
```powershell
setx OLLAMA_ORIGINS "*"
```

Then restart Ollama. For remote Ollama servers, update `VITE_OLLAMA_URL` in `.env.local` and restart `npm run dev`.

---

## Batch Processing

For CPU-only machines where generation is slow, the batch script processes transcripts one at a time from the terminal with no browser involved.

```bash
# Sample transcripts with default settings
npm run batch

# Custom server and model
npm run batch -- --ollama-url=https://your-server.example.com --model=qwen2.5:7b
```

Results are saved as JSON files in `batch-results/` (gitignored).

---

## Debugging

If analysis fails, open the browser console (F12 → Console):

- `[ollama]` — full raw text from the stream, which JSON parse attempt failed
- `[parseAnalysis]` — exactly which schema field was rejected and what value it had

The error banner in the UI also has a "Show raw model output" toggle so you can inspect the response without opening DevTools.

---

## Design Challenges Tackled

**Structured output reliability** — `format: json` and `temperature: 0` push the model toward clean JSON. The schema validator normalises common inconsistencies (casing, types) before failing. If it does fail, the raw output is surfaced immediately so the problem is diagnosable.

**Showing uncertainty** — The output is labelled a draft throughout. Every section is reviewable, each evidence card shows the exact quote and interpretation, and the confidence badge on the score card signals how much to trust the result.

**Gap detection** — The system prompt explicitly checks all four dimensions and flags any that have no transcript evidence as gaps, with targeted follow-up questions for each.

**6 vs 7 scoring boundary** — The model is taught the reasoning test (surprise + unsolicited + business relevance) rather than phrase-matching rules, so it works across varied language including Indian business English.

---

## What I Would Improve With More Time

- **Session history** — Currently each analysis session is stateless — there is no history between calls. With more time I would add a session log that stores previous analyses per Fellow, so the intern can see how scores have changed over time and track which follow-up questions were already asked in previous calls.
- **Quote highlighting** — click an evidence card to jump to that quote in the transcript
- **Edit/review workflow** — accept, rewrite, or reject individual findings inline
- **Second-pass repair** — if the model returns invalid JSON, send a focused follow-up prompt to fix the specific failing field
- **Sample transcript buttons** for faster evaluator testing
