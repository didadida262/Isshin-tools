import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faCircleCheck,
  faDownload,
  faFolderOpen,
  faSpinner,
  faXmark,
} from '@fortawesome/free-solid-svg-icons'
import { revealItemInDir } from '@tauri-apps/plugin-opener'
import type { BiliSearchItem } from '../api/bilibiliSniff'

interface SniffVideoDetailDialogProps {
  open: boolean
  item: BiliSearchItem | null
  alreadyDownloaded?: boolean
  downloading?: boolean
  openPath?: string | null
  downloadDisabled?: boolean
  onClose: () => void
  onDownload: (item: BiliSearchItem) => void
}

function formatPlay(n: number) {
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}亿`
  if (n >= 10_000) return `${(n / 10_000).toFixed(1)}万`
  return String(n)
}

function formatDelta(ms: number | null) {
  if (ms == null) return null
  const sec = Math.round(ms / 1000)
  if (sec === 0) return '时长接近'
  const sign = sec > 0 ? '+' : ''
  return `时长差 ${sign}${sec}s`
}

export function SniffVideoDetailDialog({
  open,
  item,
  alreadyDownloaded = false,
  downloading = false,
  openPath = null,
  downloadDisabled = false,
  onClose,
  onDownload,
}: SniffVideoDetailDialogProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open, onClose, item?.bvid])

  if (typeof document === 'undefined') return null

  const delta = item ? formatDelta(item.durationDeltaMs) : null

  return createPortal(
    <AnimatePresence>
      {open && item && (
        <motion.div
          className="fixed inset-0 z-60 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
        >
          <button
            type="button"
            aria-label="关闭详情"
            className="absolute inset-0 bg-black/55"
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="sniff-detail-title"
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="relative z-10 flex h-[min(90vh,760px)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-xl"
          >
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border-subtle px-5 py-4">
              <div className="min-w-0">
                <h2
                  id="sniff-detail-title"
                  className="line-clamp-2 font-display text-base font-semibold tracking-tight text-foreground"
                >
                  {item.title}
                </h2>
                <p className="mt-1 truncate text-xs text-muted">
                  {item.author}
                  <span className="text-subtle"> · </span>
                  {item.durationText}
                  <span className="text-subtle"> · </span>
                  {formatPlay(item.play)} 播放
                  {delta ? (
                    <>
                      <span className="text-subtle"> · </span>
                      {delta}
                    </>
                  ) : null}
                  <span className="text-subtle"> · </span>
                  {item.bvid}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-subtle transition-colors hover:bg-surface-hover hover:text-foreground"
                aria-label="关闭弹框"
              >
                <FontAwesomeIcon icon={faXmark} className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="aspect-video w-full bg-black">
                <iframe
                  key={item.bvid}
                  title={item.title}
                  src={`https://player.bilibili.com/player.html?bvid=${encodeURIComponent(item.bvid)}&high_quality=1&danmaku=0&autoplay=1`}
                  className="h-full w-full border-0"
                  allow="fullscreen; autoplay"
                  allowFullScreen
                  referrerPolicy="no-referrer-when-downgrade"
                />
              </div>
              <div className="px-5 py-4">
                <p className="text-[11px] leading-relaxed text-subtle">
                  播放器为 B 站内嵌页；若无法播放，可到官网打开稿件或直接下载到本地。
                </p>
                <a
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-block text-[11px] text-muted underline-offset-2 hover:text-foreground hover:underline"
                >
                  在浏览器打开 {item.url}
                </a>
              </div>
            </div>

            <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-border-subtle px-5 py-3">
              {openPath ? (
                <button
                  type="button"
                  onClick={() => void revealItemInDir(openPath)}
                  className="inline-flex items-center gap-1.5 text-[11px] text-muted transition-colors hover:text-foreground"
                >
                  <FontAwesomeIcon icon={faFolderOpen} className="h-3 w-3" />
                  打开所在目录
                </button>
              ) : (
                <span />
              )}
              <button
                type="button"
                disabled={alreadyDownloaded || downloading || downloadDisabled}
                onClick={() => onDownload(item)}
                className={`inline-flex h-9 min-w-[6.5rem] items-center justify-center gap-1.5 rounded-xl border px-3 text-[12px] transition-all ${
                  alreadyDownloaded
                    ? 'cursor-default border-success/35 bg-success/15 text-success'
                    : downloading
                      ? 'cursor-wait border-muted bg-surface-hover text-foreground'
                      : 'border-border bg-background text-foreground hover:border-muted hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-40'
                }`}
              >
                <FontAwesomeIcon
                  icon={
                    alreadyDownloaded ? faCircleCheck : downloading ? faSpinner : faDownload
                  }
                  className={`h-3.5 w-3.5 ${downloading ? 'animate-spin' : ''}`}
                />
                {alreadyDownloaded ? '已下载' : downloading ? '下载中' : '下载'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
