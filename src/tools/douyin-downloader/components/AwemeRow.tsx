import {
  memo,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import { createPortal } from 'react-dom'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faCircleCheck,
  faEllipsis,
  faFolderOpen,
  faHeart,
  faSatelliteDish,
  faSpinner,
  faTrashCan,
  faTriangleExclamation,
} from '@fortawesome/free-solid-svg-icons'
import type { DouyinAweme, DouyinDownloadedEntry, DouyinListKind } from '../types'

export const AWEME_ROW_HEIGHT = 64

export function awemeGridTemplate(_kind: DouyinListKind) {
  return '2.75rem 3.25rem minmax(0, 1fr) 5.5rem 4.5rem 4rem 7.5rem'
}

function formatDuration(ms: number) {
  if (!ms) return '—'
  const total = Math.floor(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function formatCount(n: number) {
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}亿`
  if (n >= 10_000) return `${(n / 10_000).toFixed(1)}万`
  return String(n)
}

export interface AwemeRowProps {
  item: DouyinAweme
  index: number
  kind: DouyinListKind
  downloaded: DouyinDownloadedEntry | undefined
  skipped: string | undefined
  busyDownload: boolean
  busyUnlike: boolean
  busyDelete: boolean
  isBatchTarget: boolean
  anyBatchActive: boolean
  controlsLocked: boolean
  style: CSSProperties
  onSelect: (item: DouyinAweme) => void
  onDownload: (item: DouyinAweme) => void
  onUnlike: (item: DouyinAweme) => void
  onDelete: (item: DouyinAweme) => void
  onReveal: (entry: DouyinDownloadedEntry) => void
}

export const AwemeRow = memo(function AwemeRow({
  item,
  index,
  kind,
  downloaded,
  skipped,
  busyDownload,
  busyUnlike,
  busyDelete,
  isBatchTarget,
  anyBatchActive,
  controlsLocked,
  style,
  onSelect,
  onDownload,
  onUnlike,
  onDelete,
  onReveal,
}: AwemeRowProps) {
  const menuId = useId()
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0 })
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const busyAny = busyUnlike || busyDelete || busyDownload

  const closeMenu = useCallback(() => setMenuOpen(false), [])

  const openMenu = useCallback(() => {
    const el = triggerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const menuHeight = 168
    const below = rect.bottom + 4
    const top =
      below + menuHeight > window.innerHeight - 8
        ? Math.max(8, rect.top - menuHeight - 4)
        : below
    setMenuPos({
      top,
      right: Math.max(8, window.innerWidth - rect.right),
    })
    setMenuOpen(true)
  }, [])

  useEffect(() => {
    if (!menuOpen) return
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (triggerRef.current?.contains(t) || menuRef.current?.contains(t)) return
      closeMenu()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeMenu()
    }
    const onScroll = () => closeMenu()
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', closeMenu)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', closeMenu)
    }
  }, [menuOpen, closeMenu])

  useEffect(() => {
    if (anyBatchActive || busyAny) closeMenu()
  }, [anyBatchActive, busyAny, closeMenu])

  const showUnlike = kind === 'favorite'
  const showReveal = !!downloaded
  const showDelete = !!downloaded
  const showDownload = !downloaded
  const hasMenu = showUnlike || showReveal || showDelete || showDownload

  return (
    <div
      role="row"
      style={style}
      onClick={() => {
        if (!anyBatchActive) onSelect(item)
      }}
      className={`absolute left-0 grid w-full items-center border-b border-border-subtle/60 ${
        anyBatchActive ? 'cursor-default' : 'cursor-pointer hover:bg-surface-hover/50'
      } ${isBatchTarget ? 'bg-surface-hover/70' : ''}`}
    >
      <div
        role="cell"
        className="px-2 text-right text-xs tabular-nums text-subtle"
      >
        {index + 1}
      </div>
      <div role="cell" className="px-3">
        {item.coverUrl ? (
          <img
            src={item.coverUrl}
            alt=""
            className="h-10 w-8 rounded-md object-cover"
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="h-10 w-8 rounded-md bg-surface-hover" />
        )}
      </div>
      <div role="cell" className="min-w-0 px-2">
        <p className="line-clamp-2 text-xs font-medium text-foreground">
          {item.desc || `未命名 ${index + 1}`}
        </p>
      </div>
      <div role="cell" className="truncate px-2 text-xs text-muted">
        {item.authorName || '—'}
      </div>
      <div role="cell" className="px-2 text-right text-xs tabular-nums text-subtle">
        {formatCount(item.diggCount)}
      </div>
      <div role="cell" className="px-2 text-right text-xs tabular-nums text-subtle">
        {formatDuration(item.durationMs)}
      </div>
      <div
        role="cell"
        className="whitespace-nowrap px-3 text-right"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-nowrap items-center justify-end gap-1">
          {downloaded ? (
            <span
              className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap px-1.5 text-[11px] text-success"
              title={downloaded.path}
            >
              <FontAwesomeIcon icon={faCircleCheck} className="!h-3 !w-3" />
              已下载
            </span>
          ) : skipped ? (
            <span
              className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap px-1.5 text-[11px] text-danger/80"
              title={skipped}
            >
              <FontAwesomeIcon icon={faTriangleExclamation} className="!h-3 !w-3" />
              已跳过
            </span>
          ) : null}

          {hasMenu && (
            <>
              <button
                ref={triggerRef}
                type="button"
                aria-label="更多操作"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-controls={menuOpen ? menuId : undefined}
                disabled={controlsLocked && !busyAny}
                onClick={() => {
                  if (menuOpen) closeMenu()
                  else openMenu()
                }}
                className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                  menuOpen || busyAny
                    ? 'bg-surface-hover text-foreground'
                    : 'text-muted hover:bg-background hover:text-foreground'
                }`}
              >
                <FontAwesomeIcon
                  icon={busyAny ? faSpinner : faEllipsis}
                  className={`!h-3.5 !w-3.5 ${busyAny ? 'animate-spin' : ''}`}
                />
              </button>
              {menuOpen &&
                createPortal(
                  <div
                    ref={menuRef}
                    id={menuId}
                    role="menu"
                    style={{ top: menuPos.top, right: menuPos.right }}
                    className="fixed z-[80] w-40 overflow-hidden rounded-xl border border-border bg-surface py-1 shadow-xl"
                  >
                    {showUnlike && (
                      <button
                        type="button"
                        role="menuitem"
                        disabled={controlsLocked && !busyUnlike}
                        onClick={() => {
                          closeMenu()
                          onUnlike(item)
                        }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-danger transition-colors hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <FontAwesomeIcon
                          icon={busyUnlike ? faSpinner : faHeart}
                          className={`h-3 w-3 shrink-0 ${busyUnlike ? 'animate-spin' : ''}`}
                        />
                        {busyUnlike ? '取消中' : '取消喜欢'}
                      </button>
                    )}
                    {showDownload && (
                      <button
                        type="button"
                        role="menuitem"
                        disabled={controlsLocked}
                        onClick={() => {
                          closeMenu()
                          onDownload(item)
                        }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-foreground transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <FontAwesomeIcon
                          icon={busyDownload ? faSpinner : faSatelliteDish}
                          className={`h-3 w-3 shrink-0 ${busyDownload ? 'animate-spin' : ''}`}
                        />
                        {busyDownload ? '下载中' : skipped ? '重试下载' : '下载'}
                      </button>
                    )}
                    {showReveal && downloaded && (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          closeMenu()
                          onReveal(downloaded)
                        }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-foreground transition-colors hover:bg-surface-hover"
                      >
                        <FontAwesomeIcon
                          icon={faFolderOpen}
                          className="h-3 w-3 shrink-0"
                        />
                        打开文件夹
                      </button>
                    )}
                    {showDelete && (
                      <button
                        type="button"
                        role="menuitem"
                        disabled={controlsLocked && !busyDelete}
                        onClick={() => {
                          closeMenu()
                          onDelete(item)
                        }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-danger transition-colors hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <FontAwesomeIcon
                          icon={busyDelete ? faSpinner : faTrashCan}
                          className={`h-3 w-3 shrink-0 ${busyDelete ? 'animate-spin' : ''}`}
                        />
                        {busyDelete ? '删除中' : '删除'}
                      </button>
                    )}
                  </div>,
                  document.body,
                )}
            </>
          )}
        </div>
      </div>
    </div>
  )
})
