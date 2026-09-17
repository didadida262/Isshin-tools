import { Skeleton } from '@/components/Skeleton'
import type { FactorMetric } from '../types'
import { FactorCard } from './FactorCard'

interface FactorGridProps {
  metrics: FactorMetric[]
  loading: boolean
}

const TOP_IDS = ['real-yield-10y', 'dxy', 'breakeven-10y'] as const
const MID_IDS = ['fed-funds', 'nominal-10y', 'vix-proxy'] as const
const FULL_ID = 'cb-gold'

function byId(metrics: FactorMetric[], id: string) {
  return metrics.find((m) => m.id === id) ?? null
}

export function FactorGrid({ metrics, loading }: FactorGridProps) {
  if (loading) {
    return (
      <div className="space-y-3" role="status" aria-label="因子加载中">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <SkeletonCard key={`top-${i}`} />
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <SkeletonCard key={`mid-${i}`} />
          ))}
        </div>
        <SkeletonCard tall />
      </div>
    )
  }

  const display = metrics.filter((m) => m.id !== 'xau-usd')
  const top = TOP_IDS.map((id) => byId(display, id)).filter(Boolean) as FactorMetric[]
  const mid = MID_IDS.map((id) => byId(display, id)).filter(Boolean) as FactorMetric[]
  const full = byId(display, FULL_ID)
  const rest = display.filter(
    (m) =>
      !(TOP_IDS as readonly string[]).includes(m.id) &&
      !(MID_IDS as readonly string[]).includes(m.id) &&
      m.id !== FULL_ID,
  )

  return (
    <div className="space-y-3">
      {top.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {top.map((metric) => (
            <FactorCard key={metric.id} metric={metric} />
          ))}
        </div>
      )}

      {mid.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {mid.map((metric) => (
            <FactorCard key={metric.id} metric={metric} />
          ))}
        </div>
      )}

      {full && <FactorCard metric={full} />}

      {rest.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rest.map((metric) => (
            <FactorCard key={metric.id} metric={metric} />
          ))}
        </div>
      )}
    </div>
  )
}

function SkeletonCard({
  tall = false,
  className = '',
}: {
  tall?: boolean
  className?: string
}) {
  return (
    <div
      className={`flex flex-col gap-3 rounded-2xl border border-border-subtle bg-surface/40 p-4 ${
        tall ? 'min-h-72' : ''
      } ${className}`}
    >
      <Skeleton className="h-4 w-1/2" />
      <Skeleton className="h-3 w-[80%]" />
      <Skeleton className="mt-2 h-8 w-[66%]" />
      <Skeleton className="mt-4 h-3 w-full" />
    </div>
  )
}
