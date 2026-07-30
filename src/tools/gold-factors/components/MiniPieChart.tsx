import { useMemo, useState } from 'react'
import type { FactorBreakdownSlice } from '../types'

const PIE_COLORS = [
  '#4ade80',
  '#60a5fa',
  '#fbbf24',
  '#f472b6',
  '#a78bfa',
  '#34d399',
  '#fb923c',
  '#22d3ee',
]

interface MiniPieChartProps {
  slices: FactorBreakdownSlice[]
  size?: number
}

function polar(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

function arcPath(cx: number, cy: number, r: number, start: number, end: number) {
  const s = polar(cx, cy, r, end)
  const e = polar(cx, cy, r, start)
  const large = end - start > 180 ? 1 : 0
  return `M ${cx} ${cy} L ${e.x} ${e.y} A ${r} ${r} 0 ${large} 1 ${s.x} ${s.y} Z`
}

export function MiniPieChart({ slices, size = 160 }: MiniPieChartProps) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)

  const total = useMemo(
    () => slices.reduce((sum, s) => sum + Math.max(0, s.value), 0),
    [slices],
  )

  const segments = useMemo(() => {
    if (total <= 0) return []
    let cursor = 0
    return slices.map((slice, i) => {
      const span = (Math.max(0, slice.value) / total) * 360
      const start = cursor
      const end = cursor + span
      cursor = end
      return {
        ...slice,
        index: i,
        start,
        end,
        mid: start + span / 2,
        pct: (slice.value / total) * 100,
        color: PIE_COLORS[i % PIE_COLORS.length]!,
      }
    })
  }, [slices, total])

  if (total <= 0 || segments.length === 0) return null

  // Extra padding in viewBox so exploded slices aren't clipped
  const pad = 10
  const vb = size + pad * 2
  const cx = vb / 2
  const cy = vb / 2
  const baseR = size / 2 - 2
  const hover = hoverIndex !== null ? segments[hoverIndex] : null

  return (
    <div className="flex items-center gap-4">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${vb} ${vb}`}
          className="overflow-visible"
          role="img"
          aria-label="当月净买入国构成饼图"
        >
          {segments.map((seg) => {
            const active = hoverIndex === seg.index
            const r = active ? baseR + 4 : baseR
            const explode = active ? 7 : 0
            const offset = polar(0, 0, explode, seg.mid)
            const ox = cx + offset.x
            const oy = cy + offset.y
            const span = seg.end - seg.start

            return (
              <g
                key={seg.label}
                onMouseEnter={() => setHoverIndex(seg.index)}
                onMouseLeave={() => setHoverIndex(null)}
                className="cursor-pointer"
              >
                {span >= 359.9 ? (
                  <circle
                    cx={ox}
                    cy={oy}
                    r={r}
                    fill={seg.color}
                    style={{
                      transition: 'all 160ms ease',
                      filter: active ? 'brightness(1.1)' : undefined,
                    }}
                  />
                ) : (
                  <path
                    d={arcPath(ox, oy, r, seg.start, seg.end)}
                    fill={seg.color}
                    style={{
                      transition: 'all 160ms ease',
                      opacity: hoverIndex === null || active ? 1 : 0.5,
                      filter: active ? 'brightness(1.1)' : undefined,
                    }}
                  />
                )}
              </g>
            )
          })}
        </svg>

        {hover && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="rounded-lg border border-border bg-surface/95 px-2.5 py-1.5 text-center shadow-lg backdrop-blur-sm">
              <p className="text-[11px] font-medium text-foreground">{hover.label}</p>
              <p className="mt-0.5 tabular-nums text-[10px] text-muted">
                {hover.value.toFixed(0)} t
              </p>
              <p className="tabular-nums text-[10px] text-subtle">{hover.pct.toFixed(1)}%</p>
            </div>
          </div>
        )}
      </div>

      <ul className="min-w-0 flex-1 space-y-1.5">
        {segments.map((seg) => {
          const active = hoverIndex === seg.index
          return (
            <li
              key={seg.label}
              className={`flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-[11px] transition-colors duration-150 ${
                active ? 'bg-surface-hover text-foreground' : 'text-muted'
              }`}
              onMouseEnter={() => setHoverIndex(seg.index)}
              onMouseLeave={() => setHoverIndex(null)}
            >
              <span
                className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
                style={{ background: seg.color }}
              />
              <span className={`truncate ${active ? 'font-medium text-foreground' : 'text-foreground'}`}>
                {seg.label}
              </span>
              <span className="ml-auto shrink-0 tabular-nums">
                {seg.value.toFixed(0)} t · {seg.pct.toFixed(0)}%
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
