import { useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCaretDown, faCaretUp, faCircleInfo } from '@fortawesome/free-solid-svg-icons'
import type { FactorMetric } from '../types'
import {
  cadenceLabel,
  changeAbs,
  deltaBaselineLabel,
  deltaToneClass,
  formatAsOf,
  formatDelta,
  formatValue,
} from '../lib/format'
import { getFactorInfo } from '../lib/factorInfo'
import { FactorInfoDialog } from './FactorInfoDialog'
import { MiniPieChart } from './MiniPieChart'

interface FactorCardProps {
  metric: FactorMetric
}

export function FactorCard({ metric }: FactorCardProps) {
  const [infoOpen, setInfoOpen] = useState(false)
  const delta = changeAbs(metric.value, metric.previousValue)
  const info = getFactorInfo(metric.id)
  const showPie = metric.id === 'cb-gold' && (metric.breakdown?.length ?? 0) > 0

  return (
    <>
      <article
        className="group relative flex h-full flex-col gap-3 rounded-2xl border border-border-subtle bg-surface/60 p-4 shadow-sm transition-all duration-200 ease-in-out hover:border-border hover:shadow-md"
        aria-label={metric.label}
      >
        {info && (
          <button
            type="button"
            onClick={() => setInfoOpen(true)}
            className="absolute top-3 right-3 z-10 inline-flex h-7 w-7 items-center justify-center rounded-lg border border-border-subtle bg-surface/90 text-subtle opacity-0 shadow-sm transition-all duration-200 ease-in-out group-hover:opacity-100 hover:border-border hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border"
            aria-label={`${metric.label}说明`}
            title="信息"
          >
            <FontAwesomeIcon icon={faCircleInfo} className="h-3.5 w-3.5" />
          </button>
        )}

        <div className="min-w-0 pr-8">
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
        ) : (
          <div className="space-y-3">
            <div className="space-y-1">
              <p className="font-display text-2xl font-semibold tracking-tight text-foreground tabular-nums">
                {formatValue(metric.value, metric.unit)}
              </p>
              <p
                className={`flex items-center gap-1 text-[11px] font-medium tabular-nums ${deltaToneClass(delta)}`}
              >
                <DeltaMark delta={delta} />
                <span>
                  {deltaBaselineLabel(metric)}{' '}
                  {formatDelta(metric.value, metric.previousValue, metric.unit)}
                </span>
              </p>
            </div>

            {showPie && metric.breakdown && (
              <div className="rounded-xl border border-border-subtle/80 bg-background/30 p-2.5">
                <p className="mb-2 text-[10px] tracking-wide text-subtle">当月主要净买入国构成</p>
                <MiniPieChart slices={metric.breakdown} />
              </div>
            )}
          </div>
        )}

        <div className="mt-auto flex items-center justify-between gap-2 border-t border-border-subtle pt-3 text-[10px] text-subtle">
          <span className="truncate">{metric.source}</span>
          <span className="shrink-0 tabular-nums">{formatAsOf(metric.asOf)}</span>
        </div>
      </article>

      <FactorInfoDialog
        open={infoOpen}
        title={metric.label}
        factorId={metric.id}
        content={info}
        onClose={() => setInfoOpen(false)}
      />
    </>
  )
}

function DeltaMark({ delta }: { delta: number | null }) {
  if (delta === null || Math.abs(delta) < 1e-9) {
    return <span className="inline-block w-2.5" aria-hidden />
  }
  return (
    <FontAwesomeIcon
      icon={delta > 0 ? faCaretUp : faCaretDown}
      className="h-2.5 w-2.5"
      aria-hidden
    />
  )
}
