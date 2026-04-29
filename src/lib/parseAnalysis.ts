import type { Confidence, Dimension, EvidenceSignal, KPI, ScoreBand, ScoreLabel, SystemOrPersonal } from './analysisTypes'
import type { Analysis as AnalysisType } from './analysisTypes'

const SCORE_BANDS: ScoreBand[] = ['Need Attention', 'Productivity', 'Performance']
const KPIS: KPI[] = ['Lead Generation', 'Lead Conversion', 'Upselling', 'Cross-selling', 'NPS', 'PAT', 'TAT', 'Quality']
const SCORE_LABELS: ScoreLabel[] = [
  'Not Interested',
  'Lacks Discipline',
  'Motivated but Directionless',
  'Careless and Inconsistent',
  'Consistent Performer',
  'Reliable and Productive',
  'Problem Identifier',
  'Problem Solver',
  'Innovative and Experimental',
  'Exceptional Performer',
]

const SCORE_METADATA: Record<number, { label: ScoreLabel; band: ScoreBand }> = {
  1: { label: 'Not Interested', band: 'Need Attention' },
  2: { label: 'Lacks Discipline', band: 'Need Attention' },
  3: { label: 'Motivated but Directionless', band: 'Need Attention' },
  4: { label: 'Careless and Inconsistent', band: 'Productivity' },
  5: { label: 'Consistent Performer', band: 'Productivity' },
  6: { label: 'Reliable and Productive', band: 'Productivity' },
  7: { label: 'Problem Identifier', band: 'Performance' },
  8: { label: 'Problem Solver', band: 'Performance' },
  9: { label: 'Innovative and Experimental', band: 'Performance' },
  10: { label: 'Exceptional Performer', band: 'Performance' },
}

function normalizeKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function asString(value: unknown): string | null {
  if (typeof value === 'string') return value
  // LLMs sometimes return numbers or booleans for string fields — coerce them.
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return null
}

function normalizeDimension(value: unknown): Dimension | null {
  if (typeof value !== 'string') return null
  const v = value.trim().toLowerCase()
  if (v === 'execution' || v === 'driving execution') return 'execution'
  if (v === 'systems_building' || v === 'systems building' || v === 'systems-building') return 'systems_building'
  if (v === 'kpi_impact' || v === 'kpi impact' || v === 'kpi-impact') return 'kpi_impact'
  if (v === 'change_management' || v === 'change management' || v === 'change-management') return 'change_management'
  return null
}

function normalizeSignal(value: unknown): EvidenceSignal | null {
  if (typeof value !== 'string') return null
  const v = value.trim().toLowerCase()
  if (v === 'positive') return 'positive'
  if (v === 'negative') return 'negative'
  if (v === 'neutral') return 'neutral'
  return null
}

function normalizeSystemOrPersonal(value: unknown): SystemOrPersonal | null {
  if (typeof value !== 'string') return null
  const v = value.trim().toLowerCase()
  if (v === 'system') return 'system'
  if (v === 'personal') return 'personal'
  return null
}

function normalizeConfidence(value: unknown): Confidence | null {
  if (typeof value !== 'string') return null
  const v = normalizeKey(value).replace(' confidence', '')
  if (v === 'high') return 'high'
  if (v === 'medium') return 'medium'
  if (v === 'low') return 'low'
  return null
}

function normalizeScoreBand(value: unknown): ScoreBand | null {
  if (typeof value !== 'string') return null
  const v = normalizeKey(value)
  const match = SCORE_BANDS.find((band) => normalizeKey(band) === v)
  if (match) return match
  // Partial match fallback (e.g. "band: performance" without "Band" suffix)
  if (v.includes('attention')) return 'Need Attention'
  if (v.includes('productivity')) return 'Productivity'
  if (v.includes('performance')) return 'Performance'
  return null
}

function normalizeScoreLabel(value: unknown): ScoreLabel | null {
  if (typeof value !== 'string') return null
  const v = normalizeKey(value)
  const match = SCORE_LABELS.find((label) => normalizeKey(label) === v)
  if (match) return match
  return null
}

function normalizeKpi(value: unknown): KPI | null {
  if (typeof value !== 'string') return null
  const v = normalizeKey(value)
  const match = KPIS.find((kpi) => normalizeKey(kpi) === v)
  if (match) return match
  // Common abbreviation aliases
  if (v === 'net promoter score' || v === 'customer satisfaction') return 'NPS'
  if (v === 'profit after tax' || v === 'profitability' || v === 'cost reduction') return 'PAT'
  if (v === 'turnaround time' || v === 'tat') return 'TAT'
  if (v === 'lead gen') return 'Lead Generation'
  if (v === 'lead conv' || v === 'conversion') return 'Lead Conversion'
  return null
}

function isNotNull<T>(value: T | null): value is T {
  return value !== null
}

// ─── Debug log helper ────────────────────────────────────────────────────────
// All parse failures are surfaced in the browser console under [parseAnalysis].
// Open DevTools → Console to see exactly which field rejected the response.

function dbg(path: string, reason: string, value?: unknown) {
  if (value !== undefined) {
    console.warn(`[parseAnalysis] ✗ ${path}: ${reason}`, value)
  } else {
    console.warn(`[parseAnalysis] ✗ ${path}: ${reason}`)
  }
}

// ─── Main parser ─────────────────────────────────────────────────────────────

export function parseAnalysis(raw: unknown): AnalysisType | null {
  console.group('[parseAnalysis] Parsing LLM response')
  console.log('Raw input:', raw)

  if (!isObject(raw)) {
    dbg('root', 'not an object', raw)
    console.groupEnd()
    return null
  }

  // ── score ──────────────────────────────────────────────────────────────────
  const score = raw['score']
  if (!isObject(score)) {
    dbg('score', 'missing or not an object', score)
    console.groupEnd()
    return null
  }

  const rawValue = score['value']
  const value = typeof rawValue === 'string' ? Number(rawValue) : rawValue
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    dbg('score.value', 'not a valid number', rawValue)
    console.groupEnd()
    return null
  }
  const intValue = Math.round(value)
  if (intValue < 1 || intValue > 10) {
    dbg('score.value', `out of range 1-10: ${intValue}`)
    console.groupEnd()
    return null
  }

  const label = normalizeScoreLabel(score['label'])
  if (!label) {
    dbg('score.label', 'unrecognized label', score['label'])
    // Non-fatal: fall back to the canonical label for the score value.
  }

  const band = normalizeScoreBand(score['band'])
  if (!band) {
    dbg('score.band', 'unrecognized band', score['band'])
    // Non-fatal: derive from score value.
  }

  const justification = asString(score['justification'])
  if (!justification) {
    dbg('score.justification', 'missing or not a string', score['justification'])
    console.groupEnd()
    return null
  }

  const confidence = normalizeConfidence(score['confidence'])
  if (!confidence) {
    dbg('score.confidence', 'unrecognized confidence', score['confidence'])
    // Non-fatal: default to medium.
  }

  // Always use the canonical label/band from the rubric for the given score.
  const expectedScore = SCORE_METADATA[intValue]

  // ── evidence ───────────────────────────────────────────────────────────────
  const evidenceRaw = raw['evidence']
  if (!Array.isArray(evidenceRaw)) {
    dbg('evidence', 'missing or not an array', evidenceRaw)
    console.groupEnd()
    return null
  }

  if (evidenceRaw.length < 2) {
    dbg('evidence', `fewer than 2 items (got ${evidenceRaw.length})`)
    console.groupEnd()
    return null
  }

  const evidence = evidenceRaw
    .slice(0, 8)
    .map((item, i) => {
      if (!isObject(item)) { dbg(`evidence[${i}]`, 'not an object', item); return null }
      const quote = asString(item['quote'])
      const signal = normalizeSignal(item['signal'])
      const dimension = normalizeDimension(item['dimension'])
      const interpretation = asString(item['interpretation'])
      if (!quote)         { dbg(`evidence[${i}].quote`, 'missing', item['quote']); return null }
      if (!signal)        { dbg(`evidence[${i}].signal`, 'unrecognized', item['signal']); return null }
      if (!dimension)     { dbg(`evidence[${i}].dimension`, 'unrecognized', item['dimension']); return null }
      if (!interpretation){ dbg(`evidence[${i}].interpretation`, 'missing', item['interpretation']); return null }
      return { quote, signal, dimension, interpretation }
    })
    .filter(isNotNull)

  if (evidence.length < 2) {
    dbg('evidence', `after normalization fewer than 2 valid items (got ${evidence.length})`)
    console.groupEnd()
    return null
  }

  // ── kpiMapping ─────────────────────────────────────────────────────────────
  const kpiMappingRaw = raw['kpiMapping']
  if (!Array.isArray(kpiMappingRaw)) {
    dbg('kpiMapping', 'missing or not an array', kpiMappingRaw)
    console.groupEnd()
    return null
  }

  const kpiMapping = kpiMappingRaw
    .map((item, i) => {
      if (!isObject(item)) { dbg(`kpiMapping[${i}]`, 'not an object', item); return null }
      const kpi = normalizeKpi(item['kpi'])
      const evidenceStr = asString(item['evidence'])
      const systemOrPersonal = normalizeSystemOrPersonal(item['systemOrPersonal'])
      if (!kpi)             { dbg(`kpiMapping[${i}].kpi`, 'unrecognized', item['kpi']); return null }
      if (!evidenceStr)     { dbg(`kpiMapping[${i}].evidence`, 'missing', item['evidence']); return null }
      if (!systemOrPersonal){ dbg(`kpiMapping[${i}].systemOrPersonal`, 'unrecognized', item['systemOrPersonal']); return null }
      return { kpi, evidence: evidenceStr, systemOrPersonal }
    })
    .filter(isNotNull)

  // kpiMapping is optional — 0 items is valid if the transcript has no KPI signal.

  // ── gaps ───────────────────────────────────────────────────────────────────
  const gapsRaw = raw['gaps']
  if (!Array.isArray(gapsRaw) || gapsRaw.length < 1) {
    dbg('gaps', 'missing, not an array, or empty', gapsRaw)
    console.groupEnd()
    return null
  }

  const gaps = gapsRaw
    .map((item, i) => {
      if (!isObject(item)) { dbg(`gaps[${i}]`, 'not an object', item); return null }
      const dimension = normalizeDimension(item['dimension'])
      const detail = asString(item['detail'])
      if (!dimension){ dbg(`gaps[${i}].dimension`, 'unrecognized', item['dimension']); return null }
      if (!detail)   { dbg(`gaps[${i}].detail`, 'missing', item['detail']); return null }
      return { dimension, detail }
    })
    .filter(isNotNull)

  if (gaps.length < 1) {
    dbg('gaps', 'all items failed normalization')
    console.groupEnd()
    return null
  }

  // ── followUpQuestions ──────────────────────────────────────────────────────
  const followUpRaw = raw['followUpQuestions']
  if (!Array.isArray(followUpRaw)) {
    dbg('followUpQuestions', 'missing or not an array', followUpRaw)
    console.groupEnd()
    return null
  }

  const followUpQuestions = followUpRaw
    .slice(0, 5)
    .map((item, i) => {
      if (!isObject(item)) { dbg(`followUpQuestions[${i}]`, 'not an object', item); return null }
      const question  = asString(item['question'])
      const targetGap = normalizeDimension(item['targetGap'])
      const lookingFor = asString(item['lookingFor'])
      if (!question)  { dbg(`followUpQuestions[${i}].question`, 'missing', item['question']); return null }
      if (!targetGap) { dbg(`followUpQuestions[${i}].targetGap`, 'unrecognized', item['targetGap']); return null }
      if (!lookingFor){ dbg(`followUpQuestions[${i}].lookingFor`, 'missing', item['lookingFor']); return null }
      return { question, targetGap, lookingFor }
    })
    .filter(isNotNull)

  if (followUpQuestions.length < 2) {
    dbg('followUpQuestions', `fewer than 2 valid questions (got ${followUpQuestions.length})`)
    console.groupEnd()
    return null
  }

  // ── assemble ───────────────────────────────────────────────────────────────
  const analysis: AnalysisType = {
    score: {
      value: intValue,
      label: expectedScore.label,
      band: expectedScore.band,
      justification,
      confidence: confidence ?? 'medium',
    },
    evidence,
    kpiMapping,
    gaps,
    followUpQuestions,
  }

  console.log('[parseAnalysis] ✓ parsed successfully', analysis)
  console.groupEnd()
  return analysis
}
