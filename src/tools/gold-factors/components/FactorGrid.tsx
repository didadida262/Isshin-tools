import { Skeleton } from '@/components/Skeleton'
import type { FactorMetric } from '../types'
import { FactorCard } from './FactorCard'

interface FactorGridProps {
  metrics: FactorMetric[]
  loading: boolean
}

export function FactorGrid({ metrics, loading }: FactorGridProps) {
  if (loading) {
    return (
      <div
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
        role="status"
        aria-label="因子加载中"
      >
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="flex flex-col gap-3 rounded-2xl border border-border-subtle bg-surface/40 p-4"
          >
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-3 w-[80%]" />
            <Skeleton className="mt-2 h-8 w-[66%]" />
            <Skeleton className="mt-4 h-3 w-full" />
          </div>
        ))}
      </div>
    )
  }

  const display = metrics.filter((m) => m.id !== 'xau-usd')

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {display.map((metric) => (
        <FactorCard key={metric.id} metric={metric} />
      ))}
    </div>
  )
}
