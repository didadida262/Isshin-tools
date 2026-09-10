import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
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

function Corner({
  style,
  h,
  v,
}: {
  style: CSSProperties
  h: 'left' | 'right'
  v: 'top' | 'bottom'
}) {
  return (
    <div className="pointer-events-none absolute" style={style}>
      <div
        className="absolute bg-[#f4f4f5]"
        style={{
          width: 18,
          height: 2.5,
          [h]: 0,
          [v]: 0,
          boxShadow: '0 0 10px rgba(250,250,250,0.4)',
        }}
      />
      <div
        className="absolute bg-[#f4f4f5]"
        style={{
          width: 2.5,
          height: 18,
          [h]: 0,
          [v]: 0,
          boxShadow: '0 0 10px rgba(250,250,250,0.4)',
        }}
      />
    </div>
  )
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
    setActive(false)
    setSelection(null)
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
            </defs>
            <rect
              width="100%"
              height="100%"
              fill="rgba(0,0,0,0.52)"
              mask="url(#isshin-shot-mask)"
            />
            {sel && sel.w > 0 && sel.h > 0 && (
              <rect
                x={sel.x + 0.5}
                y={sel.y + 0.5}
                width={Math.max(0, sel.w - 1)}
                height={Math.max(0, sel.h - 1)}
                fill="none"
                stroke="rgba(250,250,250,0.92)"
                strokeWidth={1.25}
              />
            )}
          </svg>

          {sel && sel.w > 0 && sel.h > 0 && (
            <>
              <Corner style={{ left: sel.x - 1, top: sel.y - 1 }} h="left" v="top" />
              <Corner style={{ left: sel.x + sel.w - 17, top: sel.y - 1 }} h="right" v="top" />
              <Corner style={{ left: sel.x - 1, top: sel.y + sel.h - 17 }} h="left" v="bottom" />
              <Corner
                style={{ left: sel.x + sel.w - 17, top: sel.y + sel.h - 17 }}
                h="right"
                v="bottom"
              />
            </>
          )}

          {!showSize && (
            <div className="pointer-events-none absolute inset-0">
              <div
                className="absolute top-0 bottom-0 w-px bg-white/30"
                style={{ left: cursor.x }}
              />
              <div
                className="absolute left-0 right-0 h-px bg-white/30"
                style={{ top: cursor.y }}
              />
            </div>
          )}

          {showSize && sel && (
            <div
              className="pointer-events-none absolute z-20 rounded-md px-2.5 py-1.5 text-[11px] font-medium tracking-wide text-zinc-100 tabular-nums"
              style={{
                left: Math.min(sel.x + sel.w + 10, window.innerWidth - 120),
                top: Math.max(12, sel.y),
                background: 'rgba(9,9,11,0.78)',
                border: '1px solid rgba(255,255,255,0.12)',
                backdropFilter: 'blur(10px)',
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
                border: '1px solid rgba(255,255,255,0.1)',
                backdropFilter: 'blur(14px)',
              }}
            >
              <span className="tracking-wide">拖拽选择区域</span>
              <span className="h-3 w-px bg-white/15" />
              <kbd className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[10px] text-zinc-300">
                Esc
              </kbd>
              <span className="text-zinc-500">取消</span>
            </div>
          </div>
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
