import { Skeleton } from '@/components/Skeleton'
import type { FactorMetric } from '../types'
import { FactorCard } from './FactorCard'

interface FactorGridProps {
  metrics: FactorMetric[]
  loading: boolean
}

const TOP_IDS = ['real-yield-10y', 'dxy', 'breakeven-10y'] as const
const STACK_IDS = ['nominal-10y', 'vix-proxy'] as const
const SIDE_ID = 'cb-gold'

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
        <div className="grid gap-3 xl:grid-cols-2">
          <div className="flex flex-col gap-3">
            <SkeletonCard />
            <SkeletonCard />
          </div>
          <SkeletonCard tall />
        </div>
      </div>
    )
  }

  const display = metrics.filter((m) => m.id !== 'xau-usd')
  const top = TOP_IDS.map((id) => byId(display, id)).filter(Boolean) as FactorMetric[]
  const stack = STACK_IDS.map((id) => byId(display, id)).filter(Boolean) as FactorMetric[]
  const side = byId(display, SIDE_ID)
  const rest = display.filter(
    (m) =>
      !(TOP_IDS as readonly string[]).includes(m.id) &&
      !(STACK_IDS as readonly string[]).includes(m.id) &&
      m.id !== SIDE_ID,
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

      {(stack.length > 0 || side) && (
        <div className="grid items-stretch gap-3 xl:grid-cols-2">
          <div className="flex min-h-0 flex-col gap-3">
            {stack.map((metric) => (
              <div key={metric.id} className="flex min-h-0 flex-1 flex-col">
                <FactorCard metric={metric} />
              </div>
            ))}
          </div>
          {side && (
            <div className="flex min-h-0 flex-col">
              <FactorCard metric={side} />
            </div>
          )}
        </div>
      )}

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

function SkeletonCard({ tall = false }: { tall?: boolean }) {
  return (
    <div
      className={`flex flex-col gap-3 rounded-2xl border border-border-subtle bg-surface/40 p-4 ${
        tall ? 'min-h-56' : ''
      }`}
    >
      <Skeleton className="h-4 w-1/2" />
      <Skeleton className="h-3 w-[80%]" />
      <Skeleton className="mt-2 h-8 w-[66%]" />
      <Skeleton className="mt-4 h-3 w-full" />
    </div>
  )
}
