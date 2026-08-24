import { useState } from 'react'
import { MIXER_MOTORS } from '../content'

const posClass: Record<(typeof MIXER_MOTORS)[number]['pos'], string> = {
  tl: 'col-start-1 row-start-1',
  tr: 'col-start-3 row-start-1',
  br: 'col-start-3 row-start-3',
  bl: 'col-start-1 row-start-3',
}

export function MixerDiagram() {
  const [active, setActive] = useState<(typeof MIXER_MOTORS)[number]['id'] | null>('M1')
  const current = MIXER_MOTORS.find((m) => m.id === active) ?? MIXER_MOTORS[0]

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="relative mx-auto aspect-square w-full max-w-72">
        <svg
          viewBox="0 0 200 200"
          className="absolute inset-[18%] text-border"
          aria-hidden
        >
          <line x1="40" y1="40" x2="160" y2="160" stroke="currentColor" strokeWidth="2" />
          <line x1="160" y1="40" x2="40" y2="160" stroke="currentColor" strokeWidth="2" />
          <rect
            x="78"
            y="78"
            width="44"
            height="44"
            rx="8"
            className="fill-surface stroke-border"
            strokeWidth="1.5"
          />
        </svg>
        <div className="grid h-full grid-cols-3 grid-rows-3 place-items-center">
          {MIXER_MOTORS.map((m) => {
            const on = m.id === active
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setActive(m.id)}
                className={`${posClass[m.pos]} flex flex-col items-center gap-1 rounded-2xl border px-3 py-2.5 transition-all duration-200 ${
                  on
                    ? 'border-border bg-surface-hover text-foreground shadow-sm'
                    : 'border-border-subtle bg-surface/70 text-muted hover:border-border hover:text-foreground'
                }`}
                aria-pressed={on}
              >
                <span className="font-display text-sm font-semibold tabular-nums">{m.id}</span>
                <span className="text-[10px] tracking-wide">
                  {m.label} · {m.spin}
                </span>
              </button>
            )
          })}
          <p className="col-start-2 row-start-2 text-center text-[10px] leading-tight text-subtle">
            X 型
            <br />
            机体
          </p>
        </div>
      </div>

      <div className="flex flex-col justify-center rounded-2xl border border-border-subtle bg-background/40 p-4">
        <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-subtle">混控输出</p>
        {current && (
          <>
            <p className="mt-2 font-display text-base font-semibold text-foreground">
              {current.id} {current.label}（{current.spin}）
            </p>
            <p className="mt-2 font-mono text-[13px] leading-relaxed text-muted">{current.formula}</p>
          </>
        )}
        <p className="mt-3 text-[11px] leading-relaxed text-subtle">
          T 为油门公共项。相邻电机转向相反，对角相同，偏航才吃反扭而不是把整机拧翻。
        </p>
      </div>
    </div>
  )
}

export function CascadeLoop() {
  const stages = [
    { title: '遥控角度', sub: '期望姿态' },
    { title: '外环 P', sub: 'Angle → Rate' },
    { title: '内环 PID', sub: '500 Hz–1 kHz' },
    { title: '混控 → PWM', sub: '四路电机' },
  ] as const

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-stretch gap-2">
        {stages.map((s, i) => (
          <div key={s.title} className="flex min-w-0 flex-1 items-center gap-2">
            <div className="min-w-0 flex-1 rounded-xl border border-border-subtle bg-surface/80 px-3 py-2.5">
              <p className="text-xs font-medium text-foreground">{s.title}</p>
              <p className="mt-0.5 text-[10px] text-subtle">{s.sub}</p>
            </div>
            {i < stages.length - 1 && (
              <span className="hidden shrink-0 text-subtle sm:inline" aria-hidden>
                →
              </span>
            )}
          </div>
        ))}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <p className="rounded-xl border border-dashed border-border-subtle px-3 py-2 text-[11px] leading-relaxed text-muted">
          外环反馈：姿态解算角度（Mahony / 互补滤波）
        </p>
        <p className="rounded-xl border border-dashed border-border-subtle px-3 py-2 text-[11px] leading-relaxed text-muted">
          内环反馈：陀螺仪原始角速度 ω（先于外环调稳）
        </p>
      </div>
    </div>
  )
}

export function ComplementaryFormula() {
  return (
    <div className="overflow-x-auto rounded-xl border border-border-subtle bg-background/50 px-4 py-3">
      <p className="font-mono text-[13px] leading-relaxed tracking-wide text-foreground">
        θ = α · (θ + ω · dt) + (1 − α) · θ<sub className="text-[11px]">acc</sub>
      </p>
      <p className="mt-2 text-[11px] leading-relaxed text-subtle">
        α 靠近 1：更信陀螺（跟手、易漂）；α 降低：更信加速度计（稳、易受振动拉偏）。1 kHz 可从 0.98 起。这不是最终算法，只用来确认符号和 dt 对不对，再上 Mahony。
      </p>
    </div>
  )
}

export function MosCircuit() {
  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <svg viewBox="0 0 320 180" className="h-auto w-full text-foreground" role="img" aria-label="一路 MOS 驱动示意">
        <rect x="8" y="8" width="304" height="164" rx="12" className="fill-background/50 stroke-border-subtle" />
        <text x="28" y="36" className="fill-muted" fontSize="11">
          VBAT 1S
        </text>
        <line x1="70" y1="32" x2="150" y2="32" className="stroke-foreground" strokeWidth="1.5" />
        <rect x="150" y="18" width="64" height="28" rx="6" className="fill-surface stroke-border" />
        <text x="162" y="36" className="fill-foreground" fontSize="11">
          电机
        </text>
        <line x1="214" y1="32" x2="250" y2="32" className="stroke-foreground" strokeWidth="1.5" />
        <line x1="250" y1="32" x2="250" y2="88" className="stroke-foreground" strokeWidth="1.5" />
        <path d="M238 88 L262 88 L250 112 Z" className="fill-surface stroke-border" />
        <text x="268" y="84" className="fill-muted" fontSize="10">
          Drain
        </text>
        <line x1="250" y1="112" x2="250" y2="148" className="stroke-foreground" strokeWidth="1.5" />
        <text x="258" y="136" className="fill-muted" fontSize="10">
          Source → GND
        </text>
        <line x1="70" y1="148" x2="250" y2="148" className="stroke-border" strokeWidth="1.5" strokeDasharray="4 3" />
        <text x="28" y="152" className="fill-muted" fontSize="11">
          GND
        </text>
        <line x1="120" y1="100" x2="238" y2="100" className="stroke-foreground" strokeWidth="1.5" />
        <text x="28" y="104" className="fill-muted" fontSize="11">
          PWM → 100Ω
        </text>
        <text x="28" y="122" className="fill-subtle" fontSize="10">
          Gate 10k 下拉到 GND
        </text>
      </svg>
      <ul className="space-y-2 text-xs leading-relaxed text-muted">
        <li>电机串在电池正极和 Drain 之间，MCU 从不直接喂电机电流。</li>
        <li>四路重复此电路，四路 PWM 脚分开，地和 VBAT 共用。</li>
        <li>先不装桨：CCR 对应 10% 时轴应慢转，0% 时完全停。</li>
      </ul>
    </div>
  )
}
