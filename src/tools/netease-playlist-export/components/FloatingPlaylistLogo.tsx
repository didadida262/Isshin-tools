import { useCallback, useRef, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faListUl } from '@fortawesome/free-solid-svg-icons'

const FAB_SIZE = 36
const EDGE_PAD = 10
const CLICK_SLOP = 4

interface FloatingPlaylistLogoProps {
  visible: boolean
  onExpand: () => void
}

/**
 * Zero-layout floating handle. Visibility is CSS-only; drag writes translate
 * on the inner button (no React re-renders per frame).
 */
export function FloatingPlaylistLogo({ visible, onExpand }: FloatingPlaylistLogoProps) {
  const btnRef = useRef<HTMLButtonElement | null>(null)
  const [pos, setPos] = useState({ x: EDGE_PAD, y: EDGE_PAD })
  const posRef = useRef(pos)
  posRef.current = pos

  const dragRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    originX: number
    originY: number
    dx: number
    dy: number
    moved: boolean
  } | null>(null)

  const clamp = useCallback((x: number, y: number) => {
    const el = btnRef.current
    const wrap = el?.parentElement
    const host = wrap?.offsetParent as HTMLElement | null
    const pw = host?.clientWidth ?? window.innerWidth
    const ph = host?.clientHeight ?? window.innerHeight
    return {
      x: Math.min(Math.max(EDGE_PAD, x), Math.max(EDGE_PAD, pw - FAB_SIZE - EDGE_PAD)),
      y: Math.min(Math.max(EDGE_PAD, y), Math.max(EDGE_PAD, ph - FAB_SIZE - EDGE_PAD)),
    }
  }, [])

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      originX: posRef.current.x,
      originY: posRef.current.y,
      dx: 0,
      dy: 0,
      moved: false,
    }
  }

  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== e.pointerId) return
    const dx = e.clientX - drag.startX
    const dy = e.clientY - drag.startY
    if (!drag.moved && dx * dx + dy * dy > CLICK_SLOP * CLICK_SLOP) {
      drag.moved = true
    }
    if (!drag.moved) return
    const next = clamp(drag.originX + dx, drag.originY + dy)
    drag.dx = next.x - drag.originX
    drag.dy = next.y - drag.originY
    const el = btnRef.current
    if (el) {
      el.style.transform = `translate3d(${drag.dx}px, ${drag.dy}px, 0)`
    }
  }

  const endPointer = (e: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== e.pointerId) return
    dragRef.current = null
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      // already released
    }
    const el = btnRef.current
    if (el) el.style.transform = ''
    if (!drag.moved) {
      onExpand()
      return
    }
    setPos(clamp(drag.originX + drag.dx, drag.originY + drag.dy))
  }

  return (
    <div
      className="absolute z-30 will-change-transform"
      style={{
        left: pos.x,
        top: pos.y,
        opacity: visible ? 1 : 0,
        transform: visible ? 'scale(1)' : 'scale(0.55)',
        pointerEvents: visible ? 'auto' : 'none',
        transition:
          'opacity 0.18s ease, transform 0.2s cubic-bezier(0.22, 1, 0.36, 1)',
      }}
      aria-hidden={!visible}
    >
      <button
        ref={btnRef}
        type="button"
        title="拖动移动，点击展开歌单"
        aria-label="展开歌单列表"
        tabIndex={visible ? 0 : -1}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        className="flex touch-none items-center justify-center rounded-xl border border-border bg-surface/90 text-muted shadow-md ring-1 ring-border/50 backdrop-blur-md will-change-transform hover:bg-surface-hover hover:text-foreground active:cursor-grabbing"
        style={{
          width: FAB_SIZE,
          height: FAB_SIZE,
          cursor: 'grab',
        }}
      >
        <FontAwesomeIcon icon={faListUl} className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
