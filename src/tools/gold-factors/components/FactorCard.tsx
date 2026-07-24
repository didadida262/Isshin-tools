import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCaretDown, faCaretUp } from '@fortawesome/free-solid-svg-icons'
import type { FactorMetric } from '../types'
import {
  cadenceLabel,
  changeAbs,
  formatAsOf,
  formatDelta,
  formatValue,
} from '../lib/format'

interface FactorCardProps {
  metric: FactorMetric
}

export function FactorCard({ metric }: FactorCardProps) {
  const isCb = metric.id === 'cb-gold'
  const delta = changeAbs(metric.value, metric.previousValue)

  return (
    <article
      className="flex flex-col gap-3 rounded-2xl border border-border-subtle bg-surface/60 p-4 shadow-sm transition-all duration-200 ease-in-out hover:border-border hover:shadow-md"
      aria-label={metric.label}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="truncate text-sm font-medium text-foreground">{metric.label}</h3>
          <span className="shrink-0 rounded-md border border-border-subtle px-1.5 py-0.5 text-[10px] tracking-wide text-subtle">
            {cadenceLabel(metric.cadence)}
          </span>
        </div>
        <p className="mt-1 text-[11px] leading-relaxed text-muted">{metric.description}</p>
      </div>

      {metric.error ? (
        <p className="text-xs text-danger">{metric.error}</p>
      ) : isCb ? (
        <div className="space-y-1">
          <p className="font-display text-2xl font-semibold tracking-tight text-subtle">非实时</p>
          <p className="text-[11px] leading-relaxed text-muted">
            跟踪 WGC 月度央行购金；本工具不伪造实时序列。
          </p>
        </div>
      ) : (
        <div className="space-y-1">
          <p className="font-display text-2xl font-semibold tracking-tight text-foreground tabular-nums">
            {formatValue(metric.value, metric.unit)}
          </p>
          <p className="flex items-center gap-1 text-[11px] tabular-nums text-muted">
            <DeltaMark delta={delta} />
            <span>
              {metric.cadence === 'realtime' ? '较上次刷新 ' : '较前值 '}
              {formatDelta(metric.value, metric.previousValue, metric.unit)}
            </span>
          </p>
        </div>
      )}

      <div className="mt-auto flex items-center justify-between gap-2 border-t border-border-subtle pt-3 text-[10px] text-subtle">
        <span className="truncate">{metric.source}</span>
        <span className="shrink-0 tabular-nums">{formatAsOf(metric.asOf)}</span>
      </div>
    </article>
  )
}

function DeltaMark({ delta }: { delta: number | null }) {
  if (delta === null || Math.abs(delta) < 1e-9) {
    return <span className="inline-block w-2.5" aria-hidden />
  }
  return (
    <FontAwesomeIcon
      icon={delta > 0 ? faCaretUp : faCaretDown}
      className="h-2.5 w-2.5 text-subtle"
      aria-hidden
    />
  )
}
