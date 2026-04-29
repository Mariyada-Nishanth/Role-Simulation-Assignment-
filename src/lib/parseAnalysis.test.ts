import { describe, expect, it } from 'vitest'
import { parseAnalysis } from './parseAnalysis'

const baseAnalysis = {
  score: {
    value: '7',
    label: 'consistent performer',
    band: 'productivity',
    justification: 'The transcript says "she found shift-wise data" and "tracker that my dispatch team uses".',
    confidence: 'Medium confidence',
  },
  evidence: [
    {
      quote: 'she made some kind of order tracker that my dispatch team uses now',
      signal: 'positive',
      dimension: 'systems building',
      interpretation: 'This is durable systems-building evidence.',
    },
    {
      quote: 'rejection rate by shift',
      signal: 'positive',
      dimension: 'kpi impact',
      interpretation: 'This maps to Quality and independent pattern finding.',
    },
    {
      quote: "they don't really listen to her",
      signal: 'negative',
      dimension: 'change management',
      interpretation: 'This is a change-management weakness.',
    },
  ],
  kpiMapping: [
    {
      kpi: 'quality',
      evidence: 'rejection rate by shift',
      systemOrPersonal: 'system',
    },
  ],
  gaps: [
    {
      dimension: 'change management',
      detail: 'Workers do not listen to her, so adoption is weak.',
    },
  ],
  followUpQuestions: [
    {
      question: 'Does the dispatch team update the tracker without her?',
      targetGap: 'systems building',
      lookingFor: 'Whether the tracker survives without the Fellow.',
    },
    {
      question: 'How have workers responded to her process changes?',
      targetGap: 'change management',
      lookingFor: 'Whether there is adoption or resistance.',
    },
    {
      question: 'Which rejection numbers changed after the tracker?',
      targetGap: 'kpi impact',
      lookingFor: 'A measurable KPI movement.',
    },
  ],
}

describe('parseAnalysis', () => {
  it('normalizes common local-model variations and derives score metadata from numeric score', () => {
    const parsed = parseAnalysis(baseAnalysis)

    expect(parsed?.score.value).toBe(7)
    expect(parsed?.score.label).toBe('Problem Identifier')
    expect(parsed?.score.band).toBe('Performance')
    expect(parsed?.score.confidence).toBe('medium')
    expect(parsed?.evidence[0]?.dimension).toBe('systems_building')
    expect(parsed?.kpiMapping[0]?.kpi).toBe('Quality')
  })

  it('rejects malformed nested evidence instead of rendering partial analysis', () => {
    const malformed = structuredClone(baseAnalysis)
    delete (malformed.evidence[1] as any).quote

    expect(parseAnalysis(malformed)).toBeNull()
  })
})

