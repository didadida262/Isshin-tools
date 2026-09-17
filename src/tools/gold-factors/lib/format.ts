import type { FactorMetric, GoldBias } from '../types'

export function changePct(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return null
  return ((current - previous) / Math.abs(previous)) * 100
}

export function changeAbs(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null) return null
  return current - previous
}

/** Green = up, red = down (standard market convention). */
export function deltaToneClass(delta: number | null): string {
  if (delta === null || Math.abs(delta) < 1e-9) return 'text-muted'
  return delta > 0 ? 'text-success' : 'text-danger'
}

export function inferGoldBias(metric: FactorMetric): GoldBias {
  if (metric.id === 'cb-gold' && metric.value === null) return 'neutral'
  if (metric.value === null || metric.error) return 'neutral'
  if (metric.goldFriendlyWhen === 'context') return 'neutral'

  const delta = changeAbs(metric.value, metric.previousValue)
  if (delta === null || Math.abs(delta) < 1e-9) return 'neutral'

  const rising = delta > 0
  if (metric.goldFriendlyWhen === 'up') return rising ? 'bullish' : 'bearish'
  return rising ? 'bearish' : 'bullish'
}

export function formatValue(value: number | null, unit: string): string {
  if (value === null) return '—'
  if (unit === '%') return `${value.toFixed(2)} %`
  if (unit === 'USD/oz') {
    const amount = new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value)
    return `$ ${amount}`
  }
  if (unit === 'CNY/g') {
    const amount = new Intl.NumberFormat('zh-CN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value)
    return `¥ ${amount}`
  }
  if (unit === 't') return `${value.toFixed(0)} t`
  return value.toFixed(2)
}

export function formatDelta(
  current: number | null,
  previous: number | null,
  unit: string,
): string {
  const abs = changeAbs(current, previous)
  const pct = changePct(current, previous)
  if (abs === null) return '—'

  const sign = abs > 0 ? '+' : ''
  if (unit === '%') return `${sign}${abs.toFixed(2)} pts`
  if (unit === 't') return `${sign}${abs.toFixed(0)} t`
  if (unit === 'USD/oz' && pct !== null) {
    return `${sign}${abs.toFixed(2)} (${sign}${pct.toFixed(2)} %)`
  }
  if (unit === 'CNY/g' && pct !== null) {
    return `${sign}${abs.toFixed(2)} (${sign}${pct.toFixed(2)} %)`
  }
  if (pct !== null) return `${sign}${abs.toFixed(2)} (${sign}${pct.toFixed(2)} %)`
  return `${sign}${abs.toFixed(2)}`
}

export function deltaBaselineLabel(metric: FactorMetric): string {
  if (metric.id === 'fed-funds') return '较上次决议'
  if (metric.cadence !== 'realtime') return '较前值'
  if (metric.unit === 'USD/oz' || metric.unit === 'CNY/g') return '较昨结'
  return '较昨收'
}

export function cadenceLabel(cadence: FactorMetric['cadence']): string {
  switch (cadence) {
    case 'realtime':
      return '近实时'
    case 'daily':
      return '日频'
    case 'monthly':
      return '月/季'
    case 'event':
      return 'FOMC'
  }
}

export function biasLabel(bias: GoldBias): string {
  switch (bias) {
    case 'bullish':
      return '利多金'
    case 'bearish':
      return '利空金'
    case 'neutral':
      return '中性'
  }
}

export function formatAsOf(asOf: string | null): string {
  if (!asOf) return '—'
  const d = new Date(asOf)
  if (!Number.isNaN(d.getTime()) && asOf.includes('T')) {
    return d.toLocaleString('zh-CN', { hour12: false })
  }
  return asOf
}
