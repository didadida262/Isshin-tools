import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCaretDown, faCaretUp } from '@fortawesome/free-solid-svg-icons'
import { changeAbs, deltaToneClass, formatAsOf, formatDelta, formatValue } from '../lib/format'
import type { FactorMetric } from '../types'
import { Skeleton } from '@/components/Skeleton'

interface SpotHeroProps {
  metric: FactorMetric | null
  loading: boolean
  fetchedAt: string | null
}

export function SpotHero({ metric, loading, fetchedAt }: SpotHeroProps) {
  if (loading && !metric) {
    return (
      <div
        className="rounded-2xl border border-border-subtle bg-surface/50 p-5 md:p-6"
        role="status"
        aria-label="金价加载中"
      >
        <Skeleton className="h-3 w-24" />
        <Skeleton className="mt-4 h-10 w-48" />
        <Skeleton className="mt-3 h-3 w-40" />
      </div>
    )
  }

  if (!metric || metric.value === null) {
    return (
      <div className="rounded-2xl border border-dashed border-border-subtle p-5 md:p-6">
        <p className="text-sm text-muted">现货金价暂不可用</p>
        {metric?.error && <p className="mt-1 text-xs text-danger">{metric.error}</p>}
      </div>
    )
  }

  const delta = changeAbs(metric.value, metric.previousValue)

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border-subtle bg-surface/70 p-5 shadow-sm md:p-6">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            'radial-gradient(ellipse 50% 80% at 0% 50%, color-mix(in srgb, var(--accent) 10%, transparent), transparent)',
        }}
      />
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-subtle">
            Spot Gold · XAU/USD
          </p>
          <p className="mt-2 font-display text-4xl font-semibold tracking-tight text-foreground tabular-nums md:text-5xl">
            {formatValue(metric.value, metric.unit)}
          </p>
          <p
            className={`mt-2 flex items-center gap-1.5 text-sm font-medium tabular-nums ${deltaToneClass(delta)}`}
          >
            <SpotDeltaMark delta={delta} />
            <span>
              较昨结 {formatDelta(metric.value, metric.previousValue, metric.unit)}
            </span>
          </p>
        </div>
        <div className="text-left text-[11px] text-subtle sm:text-right">
          <p>报价时刻 {formatAsOf(metric.asOf)}</p>
          <p className="mt-1">面板刷新 {formatAsOf(fetchedAt)}</p>
          <p className="mt-1">{metric.source}</p>
        </div>
      </div>
    </div>
  )
}

function SpotDeltaMark({ delta }: { delta: number | null }) {
  if (delta === null || Math.abs(delta) < 1e-9) {
    return <span className="inline-block w-3" aria-hidden />
  }
  return (
    <FontAwesomeIcon
      icon={delta > 0 ? faCaretUp : faCaretDown}
      className="h-3.5 w-3.5"
      aria-hidden
    />
  )
}
