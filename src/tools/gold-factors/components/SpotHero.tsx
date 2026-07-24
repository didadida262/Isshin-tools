import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faRotateRight } from '@fortawesome/free-solid-svg-icons'
import { formatAsOf, formatDelta, formatValue } from '../lib/format'
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
          <p className="mt-2 text-xs tabular-nums text-muted">
            较上次刷新 {formatDelta(metric.value, metric.previousValue, metric.unit)}
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

interface RefreshBarProps {
  autoRefresh: boolean
  onAutoRefreshChange: (value: boolean) => void
  refreshing: boolean
  onRefresh: () => void
}

export function RefreshBar({
  autoRefresh,
  onAutoRefreshChange,
  refreshing,
  onRefresh,
}: RefreshBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={onRefresh}
        disabled={refreshing}
        className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-1.5 text-xs text-foreground transition-all duration-200 ease-in-out hover:border-muted hover:bg-surface-hover hover:shadow-sm disabled:opacity-50"
      >
        <FontAwesomeIcon
          icon={faRotateRight}
          className={`h-3 w-3 ${refreshing ? 'animate-spin' : ''}`}
        />
        {refreshing ? '刷新中' : '立即刷新'}
      </button>

      <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-muted">
        <input
          type="checkbox"
          checked={autoRefresh}
          onChange={(e) => onAutoRefreshChange(e.target.checked)}
          className="h-3.5 w-3.5 rounded border-border bg-background accent-[var(--accent)]"
        />
        自动刷新 · 60s
      </label>
    </div>
  )
}
