import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCaretDown, faCaretUp } from '@fortawesome/free-solid-svg-icons'
import { changeAbs, deltaToneClass, formatAsOf, formatDelta, formatValue } from '../lib/format'
import type { FactorMetric } from '../types'
import { Skeleton } from '@/components/Skeleton'

interface SpotHeroProps {
  london: FactorMetric | null
  shanghai: FactorMetric | null
  loading: boolean
  fetchedAt: string | null
}

export function SpotHero({ london, shanghai, loading, fetchedAt }: SpotHeroProps) {
  if (loading && !london && !shanghai) {
    return (
      <div
        className="rounded-2xl border border-border-subtle bg-surface/50 p-5 md:p-6"
        role="status"
        aria-label="金价加载中"
      >
        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <Skeleton className="h-3 w-28" />
            <Skeleton className="mt-4 h-10 w-40" />
            <Skeleton className="mt-3 h-3 w-36" />
          </div>
          <div>
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-4 h-10 w-36" />
            <Skeleton className="mt-3 h-3 w-32" />
          </div>
        </div>
      </div>
    )
  }

  if ((!london || london.value === null) && (!shanghai || shanghai.value === null)) {
    return (
      <div className="rounded-2xl border border-dashed border-border-subtle p-5 md:p-6">
        <p className="text-sm text-muted">金价暂不可用</p>
        {(london?.error || shanghai?.error) && (
          <p className="mt-1 text-xs text-danger">{london?.error || shanghai?.error}</p>
        )}
      </div>
    )
  }

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
      <div className="relative grid gap-6 sm:grid-cols-2 sm:gap-8">
        <SpotQuote
          eyebrow="伦敦金 · XAU/USD"
          metric={london}
          emptyHint="伦敦金暂不可用"
        />
        <SpotQuote
          eyebrow="上海沪金 · AU 连续"
          metric={shanghai}
          emptyHint="沪金暂不可用"
          unitSuffix="/克"
        />
      </div>
      <div className="relative mt-4 flex flex-wrap gap-x-4 gap-y-1 border-t border-border-subtle/70 pt-3 text-[11px] text-subtle">
        <p>面板刷新 {formatAsOf(fetchedAt)}</p>
        {london?.asOf && <p>伦敦报价 {formatAsOf(london.asOf)}</p>}
        {shanghai?.asOf && <p>沪金日期 {formatAsOf(shanghai.asOf)}</p>}
        <p className="sm:ml-auto">
          {[london?.source, shanghai?.source].filter(Boolean).join(' · ') || '—'}
        </p>
      </div>
    </div>
  )
}

function SpotQuote({
  eyebrow,
  metric,
  emptyHint,
  unitSuffix = '',
}: {
  eyebrow: string
  metric: FactorMetric | null
  emptyHint: string
  unitSuffix?: string
}) {
  if (!metric || metric.value === null) {
    return (
      <div>
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-subtle">
          {eyebrow}
        </p>
        <p className="mt-3 text-sm text-muted">{emptyHint}</p>
        {metric?.error && <p className="mt-1 text-xs text-danger">{metric.error}</p>}
      </div>
    )
  }

  const delta = changeAbs(metric.value, metric.previousValue)

  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-subtle">
        {eyebrow}
      </p>
      <p className="mt-2 font-display text-3xl font-semibold tracking-tight text-foreground tabular-nums md:text-4xl">
        {formatValue(metric.value, metric.unit)}
        {unitSuffix ? (
          <span className="ml-1 text-base font-medium text-subtle md:text-lg">{unitSuffix}</span>
        ) : null}
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
