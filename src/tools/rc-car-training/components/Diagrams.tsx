const chainSteps = [
  { n: '①', title: '按键', sub: '手机 / 手柄' },
  { n: '②', title: '编码', sub: 'JSON 命令' },
  { n: '③', title: '无线电', sub: 'Wi‑Fi / 2.4G' },
  { n: '④', title: '解码', sub: '树莓派' },
  { n: '⑤', title: '驱动', sub: 'GPIO → 电机板' },
  { n: '⑥', title: '车动', sub: '轮子转' },
] as const

export function ControlChainDiagram() {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-stretch gap-2">
        {chainSteps.map((s, i) => (
          <div key={s.n} className="flex min-w-[5.5rem] flex-1 items-center gap-2">
            <div className="min-w-0 flex-1 rounded-xl border border-border-subtle bg-surface/80 px-2.5 py-2.5">
              <p className="text-[10px] font-medium tabular-nums text-subtle">{s.n}</p>
              <p className="mt-0.5 text-xs font-medium text-foreground">{s.title}</p>
              <p className="mt-0.5 text-[10px] text-subtle">{s.sub}</p>
            </div>
            {i < chainSteps.length - 1 && (
              <span className="hidden shrink-0 text-subtle sm:inline" aria-hidden>
                →
              </span>
            )}
          </div>
        ))}
      </div>
      <p className="text-[11px] leading-relaxed text-subtle">
        没线 ≠ 没介质。介质是电磁波；HTTP / WebSocket 是无线电之上的「信件格式」。
      </p>
    </div>
  )
}

export function DiffDriveDiagram() {
  const rows = [
    { title: '直行', left: '+', right: '+', note: '同速同向' },
    { title: '原地转', left: '+', right: '−', note: '同速反向' },
    { title: '画弧', left: '快', right: '慢', note: '左右不同速' },
  ] as const

  return (
    <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="flex flex-col items-center justify-center rounded-2xl border border-border-subtle bg-background/40 p-4">
        <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-subtle">
          输入
        </p>
        <p className="mt-2 font-mono text-sm text-foreground">throttle ∈ [-1, 1]</p>
        <p className="font-mono text-sm text-foreground">steer ∈ [-1, 1]</p>
        <p className="mt-3 text-center text-[11px] leading-relaxed text-subtle">
          left = throttle + steer
          <br />
          right = throttle − steer
        </p>
      </div>
      <div className="space-y-2">
        {rows.map((r) => (
          <div
            key={r.title}
            className="flex items-center gap-3 rounded-xl border border-border-subtle bg-surface/70 px-3 py-2.5"
          >
            <span className="w-14 shrink-0 text-xs font-medium text-foreground">{r.title}</span>
            <span className="flex flex-1 items-center justify-center gap-4 font-mono text-xs text-muted">
              <span>L {r.left}</span>
              <span className="text-subtle">|</span>
              <span>R {r.right}</span>
            </span>
            <span className="hidden text-[10px] text-subtle sm:inline">{r.note}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function RadioCompareDiagram() {
  const items = [
    {
      title: '手机 + Wi‑Fi + Pi',
      points: ['无线电：Wi‑Fi', '地址：IP / 路由器', '格式：JSON · WebSocket', '易扩展图传'],
    },
    {
      title: '玩具 2.4G / nRF24',
      points: ['无线电：专用射频', '地址：管道 / 对频', '格式：短二进制帧', '延迟通常更低'],
    },
  ] as const

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {items.map((item) => (
          <div
            key={item.title}
            className="rounded-2xl border border-border-subtle bg-surface/70 p-4"
          >
            <p className="text-xs font-medium text-foreground">{item.title}</p>
            <ul className="mt-2 space-y-1.5">
              {item.points.map((p) => (
                <li key={p} className="text-[11px] leading-relaxed text-muted">
                  {p}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className="rounded-xl border border-border-subtle/80 bg-background/40 px-3 py-2 text-[11px] leading-relaxed text-subtle">
        结论：换通道，不换物理学 —— 编码 → 发射 → 接收 → 解码 → 执行。
      </p>
    </div>
  )
}
