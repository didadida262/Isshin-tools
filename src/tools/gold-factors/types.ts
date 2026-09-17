export type FactorCadence = 'realtime' | 'daily' | 'monthly' | 'event'

export type GoldBias = 'bullish' | 'bearish' | 'neutral'

export interface FactorObservation {
  date: string
  value: number
}

export interface FactorBreakdownSlice {
  /** Display label, preferably localized */
  label: string
  /** Tonnes (positive = net buy contribution for pie) */
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
  /** Optional composition slices (e.g. CB monthly buyers) */
  breakdown?: FactorBreakdownSlice[]
}

export interface GoldFactorsSnapshot {
  fetchedAt: string
  metrics: FactorMetric[]
  spotGold: FactorMetric | null
  /** 上期所沪金连续（新浪 nf_AU0） */
  shanghaiGold: FactorMetric | null
}

export interface GoldFactorsState {
  status: 'idle' | 'loading' | 'ready' | 'error'
  snapshot: GoldFactorsSnapshot | null
  error: string | null
  lastSuccessAt: string | null
}
