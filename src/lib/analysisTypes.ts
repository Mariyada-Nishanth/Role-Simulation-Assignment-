export type ScoreBand = 'Need Attention' | 'Productivity' | 'Performance'
export type Confidence = 'high' | 'medium' | 'low'

export type EvidenceSignal = 'positive' | 'negative' | 'neutral'
export type Dimension = 'execution' | 'systems_building' | 'kpi_impact' | 'change_management'

export type ScoreLabel =
  | 'Not Interested'
  | 'Lacks Discipline'
  | 'Motivated but Directionless'
  | 'Careless and Inconsistent'
  | 'Consistent Performer'
  | 'Reliable and Productive'
  | 'Problem Identifier'
  | 'Problem Solver'
  | 'Innovative and Experimental'
  | 'Exceptional Performer'

export type KPI =
  | 'Lead Generation'
  | 'Lead Conversion'
  | 'Upselling'
  | 'Cross-selling'
  | 'NPS'
  | 'PAT'
  | 'TAT'
  | 'Quality'

export type SystemOrPersonal = 'system' | 'personal'

export type Analysis = {
  score: {
    value: number
    label: ScoreLabel
    band: ScoreBand
    justification: string
    confidence: Confidence
  }
  evidence: Array<{
    quote: string
    signal: EvidenceSignal
    dimension: Dimension
    interpretation: string
  }>
  kpiMapping: Array<{
    kpi: KPI
    evidence: string
    systemOrPersonal: SystemOrPersonal
  }>
  gaps: Array<{
    dimension: Dimension
    detail: string
  }>
  followUpQuestions: Array<{
    question: string
    targetGap: Dimension
    lookingFor: string
  }>
}

