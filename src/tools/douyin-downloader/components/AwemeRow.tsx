import { memo, type CSSProperties } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faCircleCheck,
  faFolderOpen,
  faHeart,
  faSatelliteDish,
  faSpinner,
  faTriangleExclamation,
} from '@fortawesome/free-solid-svg-icons'
import type { DouyinAweme, DouyinDownloadedEntry, DouyinListKind } from '../types'

export const AWEME_ROW_HEIGHT = 64

export function awemeGridTemplate(kind: DouyinListKind) {
  return `2.75rem 3.25rem minmax(0, 1fr) 5.5rem 4.5rem 4rem ${
    kind === 'favorite' ? '15.5rem' : '9.5rem'
  }`
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
  isBatchTarget: boolean
  anyBatchActive: boolean
  controlsLocked: boolean
  style: CSSProperties
  onSelect: (item: DouyinAweme) => void
  onDownload: (item: DouyinAweme) => void
  onUnlike: (item: DouyinAweme) => void
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
  isBatchTarget,
  anyBatchActive,
  controlsLocked,
  style,
  onSelect,
  onDownload,
  onUnlike,
  onReveal,
}: AwemeRowProps) {
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
          {kind === 'favorite' && (
            <button
              type="button"
              disabled={controlsLocked && !busyUnlike}
              onClick={() => onUnlike(item)}
              aria-busy={busyUnlike}
              className={`inline-flex h-7 shrink-0 items-center gap-1 whitespace-nowrap rounded-lg px-2 text-[11px] transition-colors ${
                busyUnlike
                  ? 'cursor-wait text-danger'
                  : 'text-danger/80 hover:bg-danger/10 hover:text-danger disabled:cursor-not-allowed disabled:opacity-40'
              }`}
              title="取消喜欢"
            >
              <FontAwesomeIcon
                icon={busyUnlike ? faSpinner : faHeart}
                className={`h-3 w-3 ${busyUnlike ? 'animate-spin' : ''}`}
              />
              {busyUnlike ? '取消中' : '取消喜欢'}
            </button>
          )}
          {downloaded ? (
            <>
              <span
                className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap px-1.5 text-[11px] text-success"
                title={downloaded.path}
              >
                <FontAwesomeIcon icon={faCircleCheck} className="h-3 w-3" />
                已下载
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onReveal(downloaded)
                }}
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-background hover:text-foreground"
                title="打开文件位置"
                aria-label="打开文件位置"
              >
                <FontAwesomeIcon icon={faFolderOpen} className="h-3 w-3" />
              </button>
            </>
          ) : (
            <>
              {skipped && (
                <span
                  className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap px-1.5 text-[11px] text-danger/80"
                  title={skipped}
                >
                  <FontAwesomeIcon icon={faTriangleExclamation} className="h-3 w-3" />
                  已跳过
                </span>
              )}
              <button
                type="button"
                disabled={controlsLocked}
                onClick={() => onDownload(item)}
                aria-busy={busyDownload}
                className={`inline-flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 text-[11px] transition-colors ${
                  busyDownload
                    ? 'cursor-wait text-foreground'
                    : 'text-muted hover:bg-background hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40'
                }`}
                title={skipped ? '手动重试下载' : undefined}
              >
                <FontAwesomeIcon
                  icon={busyDownload ? faSpinner : faSatelliteDish}
                  className={`h-3 w-3 ${busyDownload ? 'animate-spin' : ''}`}
                />
                {busyDownload ? '下载中' : skipped ? '重试' : '下载'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
})
