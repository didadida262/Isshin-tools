import { useEffect, useState } from 'react'
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
import { useToast } from '@/components/Toast'
import {
  downloadBilibiliVideo,
  type BiliDownloadedEntry,
  type BiliSearchItem,
} from '../api/bilibiliApi'

interface VideoDetailDialogProps {
  open: boolean
  item: BiliSearchItem | null
  downloaded?: BiliDownloadedEntry | null
  onClose: () => void
  onDownloaded: (entry: BiliDownloadedEntry) => void
}

function formatPlay(n: number) {
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}亿`
  if (n >= 10_000) return `${(n / 10_000).toFixed(1)}万`
  return String(n)
}

export function VideoDetailDialog({
  open,
  item,
  downloaded = null,
  onClose,
  onDownloaded,
}: VideoDetailDialogProps) {
  const { toast } = useToast()
  const [downloading, setDownloading] = useState(false)
  const [lastPath, setLastPath] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setLastPath(null)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose, item?.bvid])

  const handleDownload = async () => {
    if (!item || downloading) return
    setDownloading(true)
    try {
      const result = await downloadBilibiliVideo({
        bvid: item.bvid,
        title: item.title,
        author: item.author,
      })
      setLastPath(result.path)
      onDownloaded({
        songId: result.songId,
        playlistId: null,
        playlistName: 'B站',
        path: result.path,
        bvid: result.bvid,
        title: item.title,
        artists: item.author,
        downloadedAt: Math.floor(Date.now() / 1000),
      })
      toast('已下载到 downloads/网易云音乐/B站', 'success')
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'danger')
    } finally {
      setDownloading(false)
    }
  }

  const openPath = lastPath ?? downloaded?.path ?? null
  const already = !!downloaded

  if (typeof document === 'undefined') return null

  return createPortal(
    <AnimatePresence>
      {open && item && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
        >
          <button
            type="button"
            aria-label="关闭"
            className="absolute inset-0 bg-black/55"
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="bili-detail-title"
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="relative z-10 flex h-[min(90vh,760px)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-xl"
          >
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border-subtle px-5 py-4">
              <div className="min-w-0">
                <h2
                  id="bili-detail-title"
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
                  title={item.title}
                  src={`https://player.bilibili.com/player.html?bvid=${encodeURIComponent(item.bvid)}&high_quality=1&danmaku=0`}
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
                disabled={already || downloading}
                onClick={() => void handleDownload()}
                className={`inline-flex h-9 min-w-[6.5rem] items-center justify-center gap-1.5 rounded-xl border px-3 text-[12px] transition-all ${
                  already
                    ? 'cursor-default border-success/35 bg-success/15 text-success'
                    : downloading
                      ? 'cursor-wait border-muted bg-surface-hover text-foreground'
                      : 'border-border bg-background text-foreground hover:border-muted hover:bg-surface-hover'
                }`}
              >
                <FontAwesomeIcon
                  icon={already ? faCircleCheck : downloading ? faSpinner : faDownload}
                  className={`h-3.5 w-3.5 ${downloading ? 'animate-spin' : ''}`}
                />
                {already ? '已下载' : downloading ? '下载中' : '下载'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
