import { useRef, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faArrowLeft,
  faArrowRight,
  faCheck,
  faTriangleExclamation,
} from '@fortawesome/free-solid-svg-icons'
import {
  STAGES,
  type PrepGroup,
  type Stage,
  type StageBlock,
} from './content'
import {
  CascadeLoop,
  ComplementaryFormula,
  MixerDiagram,
  MosCircuit,
} from './components/Diagrams'

export function DroneTrainingTool() {
  const [index, setIndex] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)
  const stage = STAGES[index] ?? STAGES[0]
  const atFirst = index <= 0
  const atLast = index >= STAGES.length - 1

  const go = (next: number) => {
    setIndex(next)
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }

  if (!stage) return null

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="relative shrink-0 overflow-hidden border-b border-border-subtle px-5 py-4 md:px-6">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{
            background:
              'radial-gradient(ellipse 50% 80% at 92% 20%, color-mix(in srgb, var(--accent) 14%, transparent), transparent)',
          }}
        />
        <QuadSilhouette />
        <div className="relative max-w-2xl pr-24 md:pr-36">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-subtle">
            从 0 到 1 · 手写最小闭环
          </p>
          <h1 className="mt-1 font-display text-xl font-semibold tracking-tight text-foreground">
            搭一台能悬停的微型四轴
          </h1>
          <p className="mt-1.5 text-xs leading-relaxed text-muted">
            按阶段做，没过关不要跳。毕业标准：解锁后离地约 10 cm，平稳悬停数秒。
          </p>
        </div>
      </header>

      <nav
        className="shrink-0 overflow-x-auto border-b border-border-subtle px-3 py-2 md:px-5"
        aria-label="教程阶段"
      >
        <ol className="flex min-w-min gap-1">
          {STAGES.map((s, i) => {
            const on = i === index
            const done = i < index
            return (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => go(i)}
                  className={`flex items-center gap-2 rounded-xl px-3 py-2 text-left transition-colors duration-200 ${
                    on
                      ? 'bg-surface-hover text-foreground'
                      : 'text-muted hover:bg-surface-hover/60 hover:text-foreground'
                  }`}
                  aria-current={on ? 'step' : undefined}
                >
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[10px] font-semibold tabular-nums ${
                      on
                        ? 'bg-foreground text-background'
                        : done
                          ? 'bg-success/20 text-success'
                          : 'bg-background text-subtle'
                    }`}
                  >
                    {done ? <FontAwesomeIcon icon={faCheck} className="h-2.5 w-2.5" /> : s.index}
                  </span>
                  <span className="whitespace-nowrap text-xs font-medium">{s.title}</span>
                </button>
              </li>
            )
          })}
        </ol>
      </nav>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        <article className="mx-auto max-w-3xl space-y-5 px-5 py-6 pb-10 md:px-6">
          <StageIntro stage={stage} />
          <PrepList groups={stage.prep} />
          {stage.blocks.map((block, i) => (
            <StageBlockView key={`${stage.id}-${i}`} block={block} />
          ))}
          <PassList items={stage.pass} />
          <StagePager
            atFirst={atFirst}
            atLast={atLast}
            prevTitle={STAGES[index - 1]?.title}
            nextTitle={STAGES[index + 1]?.title}
            onPrev={() => go(Math.max(0, index - 1))}
            onNext={() => go(Math.min(STAGES.length - 1, index + 1))}
          />
        </article>
      </div>
    </div>
  )
}

function QuadSilhouette() {
  const rotors = [
    { cx: 32, cy: 32, dir: 1 },
    { cx: 128, cy: 32, dir: -1 },
    { cx: 128, cy: 128, dir: 1 },
    { cx: 32, cy: 128, dir: -1 },
  ] as const

  return (
    <svg
      aria-hidden
      viewBox="0 0 160 160"
      className="pointer-events-none absolute -right-1 top-1/2 h-28 w-28 -translate-y-1/2 text-border md:right-5 md:h-36 md:w-36"
    >
      <line x1="32" y1="32" x2="128" y2="128" stroke="currentColor" strokeWidth="3" />
      <line x1="128" y1="32" x2="32" y2="128" stroke="currentColor" strokeWidth="3" />
      <rect
        x="66"
        y="66"
        width="28"
        height="28"
        rx="6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
      />
      {rotors.map((r) => (
        <g key={`${r.cx}-${r.cy}`}>
          <circle cx={r.cx} cy={r.cy} r="14" fill="none" stroke="currentColor" strokeWidth="2.5" />
          <g>
            <line
              x1={r.cx - 11}
              y1={r.cy}
              x2={r.cx + 11}
              y2={r.cy}
              stroke="currentColor"
              strokeWidth="1.5"
              opacity="0.85"
            />
            <line
              x1={r.cx}
              y1={r.cy - 11}
              x2={r.cx}
              y2={r.cy + 11}
              stroke="currentColor"
              strokeWidth="1.5"
              opacity="0.45"
            />
            <animateTransform
              attributeName="transform"
              type="rotate"
              from={`0 ${r.cx} ${r.cy}`}
              to={`${r.dir * 360} ${r.cx} ${r.cy}`}
              dur="1.8s"
              repeatCount="indefinite"
            />
          </g>
        </g>
      ))}
    </svg>
  )
}

function StageIntro({ stage }: { stage: Stage }) {
  return (
    <div className="rounded-2xl border border-border-subtle bg-surface/70 p-4 md:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-subtle">
          阶段 {stage.index} · {stage.hours}
        </p>
      </div>
      <h2 className="mt-1.5 font-display text-lg font-semibold tracking-tight text-foreground">
        {stage.title}
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-muted">{stage.goal}</p>
      <p className="mt-3 rounded-xl border border-border-subtle/80 bg-background/40 px-3 py-2 text-xs leading-relaxed text-foreground">
        <span className="text-subtle">本阶段交付：</span> {stage.deliverable}
      </p>
    </div>
  )
}

function PrepList({ groups }: { groups: PrepGroup[] }) {
  return (
    <section className="rounded-2xl border border-border-subtle bg-surface/70 p-4 md:p-5">
      <h3 className="text-[11px] font-medium uppercase tracking-[0.12em] text-subtle">
        开做前准备好
      </h3>
      <div className="mt-3 space-y-3">
        {groups.map((group) => {
          const avoid = group.label.includes('不要')
          return (
            <div
              key={group.label}
              className={
                avoid
                  ? 'rounded-xl border border-danger/30 px-3 py-2.5'
                  : 'rounded-xl border border-border-subtle/80 bg-background/30 px-3 py-2.5'
              }
            >
              <p
                className={`text-[11px] font-medium ${avoid ? 'text-danger' : 'text-foreground'}`}
              >
                {group.label}
              </p>
              <ul className="mt-2 space-y-1.5">
                {group.items.map((item) => (
                  <li key={item.name} className="grid gap-0.5 text-xs sm:grid-cols-[7.5rem_minmax(0,1fr)]">
                    <span className="font-medium text-foreground">{item.name}</span>
                    <span className="leading-relaxed text-muted">{item.spec}</span>
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function StageBlockView({ block }: { block: StageBlock }) {
  switch (block.type) {
    case 'theory':
      return (
        <section className="rounded-2xl border border-border-subtle bg-surface/50 p-4">
          <h3 className="text-[11px] font-medium uppercase tracking-[0.12em] text-subtle">
            先搞懂 · {block.title}
          </h3>
          <p className="mt-2 text-xs leading-relaxed text-muted">{block.body}</p>
        </section>
      )
    case 'steps':
      return (
        <section>
          <h3 className="text-[11px] font-medium uppercase tracking-[0.12em] text-subtle">
            动手 · {block.title}
          </h3>
          <ol className="mt-3 space-y-3">
            {block.items.map((item, i) => (
              <li
                key={item.title}
                className="rounded-2xl border border-border-subtle bg-surface/60 p-4"
              >
                <p className="flex gap-2 text-xs font-medium text-foreground">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-background text-[10px] tabular-nums text-subtle">
                    {i + 1}
                  </span>
                  {item.title}
                </p>
                <p className="mt-2 text-xs leading-relaxed text-muted">{item.body}</p>
                {item.code && (
                  <pre className="mt-3 overflow-x-auto rounded-xl border border-border-subtle bg-background/70 p-3 font-mono text-[11px] leading-relaxed text-foreground">
                    <code>{item.code}</code>
                  </pre>
                )}
              </li>
            ))}
          </ol>
        </section>
      )
    case 'table':
      return (
        <section className="overflow-hidden rounded-2xl border border-border-subtle">
          <div className="bg-surface/80 px-4 py-3">
            <h3 className="text-xs font-medium text-foreground">{block.title}</h3>
            {block.caption && (
              <p className="mt-1 text-[11px] leading-relaxed text-subtle">{block.caption}</p>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[32rem] text-left text-[11px]">
              <thead className="bg-background/60 text-subtle">
                <tr className="border-t border-border-subtle">
                  {block.headers.map((h) => (
                    <th key={h} className="px-4 py-2 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.rows.map((row) => (
                  <tr key={row.join('|')} className="border-t border-border-subtle">
                    {row.map((cell, i) => (
                      <td
                        key={`${row[0]}-${i}`}
                        className={`px-4 py-2 align-top ${i === 0 ? 'text-foreground' : 'text-muted'}`}
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )
    case 'formula':
      return (
        <section className="rounded-2xl border border-border-subtle bg-surface/40 p-4">
          <h3 className="text-[11px] font-medium uppercase tracking-[0.12em] text-subtle">
            {block.title}
          </h3>
          <p className="mt-3 overflow-x-auto font-mono text-[13px] leading-relaxed text-foreground">
            {block.expr}
          </p>
          <p className="mt-2 text-[11px] leading-relaxed text-subtle">{block.note}</p>
        </section>
      )
    case 'diagram':
      return (
        <section className="rounded-2xl border border-border-subtle bg-surface/40 p-4 md:p-5">
          <h3 className="text-[11px] font-medium uppercase tracking-[0.12em] text-subtle">
            {block.title}
          </h3>
          <div className="mt-4">
            {block.kind === 'mixer' && <MixerDiagram />}
            {block.kind === 'cascade' && <CascadeLoop />}
            {block.kind === 'complementary' && <ComplementaryFormula />}
            {block.kind === 'mos' && <MosCircuit />}
          </div>
        </section>
      )
    case 'warn':
      return (
        <section className="rounded-2xl border border-danger/30 bg-surface p-4">
          <h3 className="flex items-center gap-2 text-xs font-medium text-foreground">
            <FontAwesomeIcon icon={faTriangleExclamation} className="h-3.5 w-3.5 text-danger" />
            {block.title}
          </h3>
          <ul className="mt-3 space-y-2">
            {block.items.map((item) => (
              <li key={item} className="text-xs leading-relaxed text-muted">
                {item}
              </li>
            ))}
          </ul>
        </section>
      )
    case 'pitfalls':
      return (
        <section>
          <h3 className="text-[11px] font-medium uppercase tracking-[0.12em] text-subtle">
            这一阶段常见翻车
          </h3>
          <ul className="mt-3 space-y-2">
            {block.items.map((item) => (
              <li
                key={item.problem}
                className="rounded-2xl border border-border-subtle bg-surface/50 px-4 py-3"
              >
                <p className="text-xs font-medium text-foreground">{item.problem}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted">{item.fix}</p>
              </li>
            ))}
          </ul>
        </section>
      )
  }
}

function PassList({ items }: { items: string[] }) {
  return (
    <section className="rounded-2xl border border-border-subtle bg-surface/70 p-4">
      <h3 className="text-[11px] font-medium uppercase tracking-[0.12em] text-subtle">
        过关再进入下一阶段
      </h3>
      <ul className="mt-3 space-y-2">
        {items.map((item) => (
          <li key={item} className="flex gap-2 text-xs leading-relaxed text-muted">
            <FontAwesomeIcon icon={faCheck} className="mt-0.5 h-3 w-3 shrink-0 text-success" />
            {item}
          </li>
        ))}
      </ul>
    </section>
  )
}

function StagePager({
  atFirst,
  atLast,
  prevTitle,
  nextTitle,
  onPrev,
  onNext,
}: {
  atFirst: boolean
  atLast: boolean
  prevTitle?: string
  nextTitle?: string
  onPrev: () => void
  onNext: () => void
}) {
  return (
    <div className="flex flex-wrap items-stretch justify-between gap-2 border-t border-border-subtle pt-4">
      <button
        type="button"
        onClick={onPrev}
        disabled={atFirst}
        className="inline-flex min-w-36 items-center gap-2 rounded-xl border border-border-subtle px-3 py-2.5 text-left text-xs text-muted transition-colors enabled:hover:border-border enabled:hover:text-foreground disabled:opacity-40"
      >
        <FontAwesomeIcon icon={faArrowLeft} className="h-3 w-3" />
        <span>
          <span className="block text-[10px] text-subtle">上一阶段</span>
          {prevTitle ?? '—'}
        </span>
      </button>
      <button
        type="button"
        onClick={onNext}
        disabled={atLast}
        className="inline-flex min-w-36 items-center justify-end gap-2 rounded-xl border border-border-subtle px-3 py-2.5 text-right text-xs text-muted transition-colors enabled:hover:border-border enabled:hover:text-foreground disabled:opacity-40"
      >
        <span>
          <span className="block text-[10px] text-subtle">下一阶段</span>
          {nextTitle ?? '—'}
        </span>
        <FontAwesomeIcon icon={faArrowRight} className="h-3 w-3" />
      </button>
    </div>
  )
}

export default DroneTrainingTool
