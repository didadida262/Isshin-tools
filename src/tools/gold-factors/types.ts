export type FactorCadence = 'realtime' | 'daily' | 'monthly'

export type GoldBias = 'bullish' | 'bearish' | 'neutral'

export interface FactorObservation {
  date: string
  value: number
}

export interface FactorMetric {
  id: string
  label: string
  shortLabel: string
  description: string
  cadence: FactorCadence
  unit: string
  value: number | null
  previousValue: number | null
  asOf: string | null
  source: string
  /** Direction that is typically supportive for gold */
  goldFriendlyWhen: 'up' | 'down' | 'context'
  error?: string
}

export interface GoldFactorsSnapshot {
  fetchedAt: string
  metrics: FactorMetric[]
  spotGold: FactorMetric | null
}

export interface GoldFactorsState {
  status: 'idle' | 'loading' | 'ready' | 'error'
  snapshot: GoldFactorsSnapshot | null
  error: string | null
  lastSuccessAt: string | null
}
