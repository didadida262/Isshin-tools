import { useCallback, useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'

interface ArmMeta {
  sessionId: number
  logicalWidth: number
  logicalHeight: number
  scale: number
}

interface Rect {
  x: number
  y: number
  w: number
  h: number
}

function normalizeRect(a: { x: number; y: number }, b: { x: number; y: number }): Rect {
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  const w = Math.abs(b.x - a.x)
  const h = Math.abs(b.y - a.y)
  return { x, y, w, h }
}

function waitFrames(n: number): Promise<void> {
  return new Promise((resolve) => {
    const step = (left: number) => {
      if (left <= 0) {
        resolve()
        return
      }
      requestAnimationFrame(() => step(left - 1))
    }
    step(n)
  })
}

export function ScreenshotOverlay() {
  const [active, setActive] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cursor, setCursor] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const [origin, setOrigin] = useState<{ x: number; y: number } | null>(null)
  const [selection, setSelection] = useState<Rect | null>(null)
  const confirming = useRef(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    document.documentElement.style.background = 'transparent'
    document.body.style.background = 'transparent'
    const root = document.getElementById('root')
    if (root) root.style.background = 'transparent'

    let cancelled = false
    const unsubs: Array<() => void> = []
    const track = (unlisten: () => void) => {
      if (cancelled) {
        unlisten()
        return
      }
      unsubs.push(unlisten)
    }

    void listen<ArmMeta>('screenshot-arm', () => {
      confirming.current = false
      setError(null)
      setSelection(null)
      setOrigin(null)
      setDragging(false)
      setActive(true)
    }).then(track)

    void invoke('screenshot_overlay_ready').catch(() => {})

    return () => {
      cancelled = true
      for (const u of unsubs) u()
    }
  }, [])

  // Reveal only after React has committed the dim layer — prevents empty-frame flash.
  useEffect(() => {
    if (!active) return
    void invoke('screenshot_reveal').catch(() => {})
  }, [active])

  const cancel = useCallback(async () => {
    if (confirming.current) return
    setActive(false)
    setSelection(null)
    try {
      await invoke('screenshot_cancel')
    } catch {
      /* already hidden */
    }
  }, [])

  const confirm = useCallback(async (rect: Rect) => {
    if (confirming.current || rect.w < 4 || rect.h < 4) return
    confirming.current = true
    // Tear down overlay UI synchronously before capture, otherwise the cyan
    // frame is still on-screen when Rust grabs the display.
    flushSync(() => {
      setActive(false)
      setSelection(null)
    })
    await waitFrames(2)
    try {
      await invoke('screenshot_confirm', {
        x: rect.x,
        y: rect.y,
        width: rect.w,
        height: rect.h,
      })
    } catch (e) {
      confirming.current = false
      setActive(true)
      setError(typeof e === 'string' ? e : '复制失败')
    }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!active && !error) return
      if (e.key === 'Escape') {
        e.preventDefault()
        void cancel()
        return
      }
      if (e.key === 'Enter' && selection && selection.w >= 4 && selection.h >= 4) {
        e.preventDefault()
        void confirm(selection)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, cancel, confirm, error, selection])

  const onPointerDown = (e: React.PointerEvent) => {
    if (!active || e.button !== 0) return
    const el = rootRef.current
    if (!el) return
    el.setPointerCapture(e.pointerId)
    const r = el.getBoundingClientRect()
    const p = { x: e.clientX - r.left, y: e.clientY - r.top }
    setOrigin(p)
    setSelection({ x: p.x, y: p.y, w: 0, h: 0 })
    setDragging(true)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const el = rootRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const p = { x: e.clientX - r.left, y: e.clientY - r.top }
    setCursor(p)
    if (!dragging || !origin) return
    setSelection(normalizeRect(origin, p))
  }

  const onPointerUp = (e: React.PointerEvent) => {
    if (!dragging || !origin) return
    const el = rootRef.current
    if (!el) return
    el.releasePointerCapture(e.pointerId)
    const r = el.getBoundingClientRect()
    const p = { x: e.clientX - r.left, y: e.clientY - r.top }
    const rect = normalizeRect(origin, p)
    setDragging(false)
    setOrigin(null)
    if (rect.w < 4 || rect.h < 4) {
      setSelection(null)
      return
    }
    setSelection(rect)
    void confirm(rect)
  }

  const sel = selection
  const showSize = Boolean(sel && sel.w >= 4 && sel.h >= 4)

  return (
    <div
      ref={rootRef}
      className="fixed inset-0 select-none overflow-hidden"
      style={{
        cursor: active ? 'crosshair' : 'default',
        background: 'transparent',
        fontFamily: '"Instrument Sans", "IBM Plex Sans", ui-sans-serif, sans-serif',
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {active && (
        <>
          <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
            <defs>
              <mask id="isshin-shot-mask">
                <rect width="100%" height="100%" fill="white" />
                {sel && sel.w > 0 && sel.h > 0 && (
                  <rect x={sel.x} y={sel.y} width={sel.w} height={sel.h} fill="black" />
                )}
              </mask>
              <linearGradient id="isshin-shot-flow" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#f0fdfa">
                  <animate
                    attributeName="stop-color"
                    values="#f0fdfa;#22d3ee;#2dd4bf;#f0fdfa"
                    dur="2.2s"
                    repeatCount="indefinite"
                  />
                </stop>
                <stop offset="45%" stopColor="#22d3ee">
                  <animate
                    attributeName="stop-color"
                    values="#22d3ee;#2dd4bf;#67e8f9;#22d3ee"
                    dur="2.2s"
                    repeatCount="indefinite"
                  />
                </stop>
                <stop offset="100%" stopColor="#67e8f9">
                  <animate
                    attributeName="stop-color"
                    values="#67e8f9;#f0fdfa;#22d3ee;#67e8f9"
                    dur="2.2s"
                    repeatCount="indefinite"
                  />
                </stop>
              </linearGradient>
            </defs>
            <rect
              width="100%"
              height="100%"
              fill="rgba(0,0,0,0.52)"
              mask="url(#isshin-shot-mask)"
            />
            {sel && sel.w > 0 && sel.h > 0 && (
              <g>
                <rect
                  x={sel.x + 0.5}
                  y={sel.y + 0.5}
                  width={Math.max(0, sel.w - 1)}
                  height={Math.max(0, sel.h - 1)}
                  fill="none"
                  stroke="url(#isshin-shot-flow)"
                  strokeWidth={2}
                />
                <rect
                  x={sel.x + 0.5}
                  y={sel.y + 0.5}
                  width={Math.max(0, sel.w - 1)}
                  height={Math.max(0, sel.h - 1)}
                  fill="none"
                  stroke="rgba(240,253,250,0.9)"
                  strokeWidth={1.1}
                  strokeDasharray="10 14"
                  className="isshin-shot-dash"
                />
              </g>
            )}
          </svg>

          {!showSize && (
            <div className="pointer-events-none absolute inset-0">
              <div
                className="absolute top-0 bottom-0 w-px"
                style={{
                  left: cursor.x,
                  background:
                    'linear-gradient(180deg, transparent, rgba(34,211,238,0.55), transparent)',
                  boxShadow: '0 0 8px rgba(34,211,238,0.35)',
                }}
              />
              <div
                className="absolute left-0 right-0 h-px"
                style={{
                  top: cursor.y,
                  background:
                    'linear-gradient(90deg, transparent, rgba(45,212,191,0.55), transparent)',
                  boxShadow: '0 0 8px rgba(45,212,191,0.35)',
                }}
              />
              <div
                className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
                style={{
                  left: cursor.x,
                  top: cursor.y,
                  background: 'rgba(240,253,250,0.9)',
                  boxShadow: '0 0 0 2px rgba(34,211,238,0.7), 0 0 12px rgba(34,211,238,0.8)',
                }}
              />
            </div>
          )}

          {showSize && sel && (
            <div
              className="pointer-events-none absolute z-20 rounded-md px-2.5 py-1.5 text-[11px] font-semibold tracking-wide tabular-nums"
              style={{
                left: Math.min(sel.x + sel.w + 10, window.innerWidth - 120),
                top: Math.max(12, sel.y),
                color: '#ecfeff',
                background:
                  'linear-gradient(135deg, rgba(8,47,53,0.88), rgba(9,9,11,0.82))',
                border: '1px solid rgba(34,211,238,0.45)',
                backdropFilter: 'blur(10px)',
                boxShadow: '0 0 16px rgba(34,211,238,0.25), inset 0 1px 0 rgba(255,255,255,0.08)',
              }}
            >
              {Math.round(sel.w)} × {Math.round(sel.h)}
            </div>
          )}

          <div className="pointer-events-none absolute left-1/2 top-7 z-30 -translate-x-1/2">
            <div
              className="flex items-center gap-3 rounded-full px-4 py-2 text-[12px] text-zinc-200"
              style={{
                background: 'rgba(9,9,11,0.72)',
                border: '1px solid rgba(34,211,238,0.22)',
                backdropFilter: 'blur(14px)',
                boxShadow: '0 8px 28px rgba(0,0,0,0.35)',
              }}
            >
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{
                  background: '#22d3ee',
                  boxShadow: '0 0 8px #22d3ee',
                }}
              />
              <span className="tracking-wide">拖拽选择区域</span>
              <span className="h-3 w-px bg-white/15" />
              <kbd className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[10px] text-zinc-300">
                Esc
              </kbd>
              <span className="text-zinc-500">取消</span>
            </div>
          </div>

          <style>{`
            @keyframes isshin-shot-dash-move {
              to { stroke-dashoffset: -48; }
            }
            .isshin-shot-dash {
              animation: isshin-shot-dash-move 0.85s linear infinite;
            }
          `}</style>
        </>
      )}

      {error && (
        <div className="absolute bottom-8 left-1/2 z-40 max-w-md -translate-x-1/2 rounded-lg border border-red-500/30 bg-zinc-950/90 px-4 py-3 text-center text-sm text-red-300 backdrop-blur">
          {error}
          <button
            type="button"
            className="mt-2 block w-full text-xs text-zinc-400 underline"
            onClick={() => void cancel()}
          >
            关闭
          </button>
        </div>
      )}
    </div>
  )
}
