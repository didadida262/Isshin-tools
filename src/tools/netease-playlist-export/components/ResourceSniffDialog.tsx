import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faDownload,
  faFolderOpen,
  faSpinner,
  faXmark,
} from '@fortawesome/free-solid-svg-icons'
import { revealItemInDir } from '@tauri-apps/plugin-opener'
import { useToast } from '@/components/Toast'
import {
  downloadBilibili,
  searchBilibili,
  type BiliSearchItem,
} from '../api/bilibiliSniff'
import type { NeteaseTrack } from '../types'

interface ResourceSniffDialogProps {
  open: boolean
  track: NeteaseTrack | null
  onClose: () => void
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

export function ResourceSniffDialog({
  open,
  track,
  onClose,
}: ResourceSniffDialogProps) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [items, setItems] = useState<BiliSearchItem[]>([])
  const [downloadingBvid, setDownloadingBvid] = useState<string | null>(null)
  const [lastPath, setLastPath] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
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
  }, [open, onClose])

  useEffect(() => {
    if (!open || !track) return
    let cancelled = false
    setLoading(true)
    setError(null)
    setItems([])
    setLastPath(null)
    const keyword = [track.name, track.artists].filter(Boolean).join(' ')
    void (async () => {
      try {
        const result = await searchBilibili(keyword, track.durationMs || undefined)
        if (cancelled) return
        setItems(result)
      } catch (e) {
        if (cancelled) return
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, track])

  const handleDownload = async (item: BiliSearchItem) => {
    if (!track) return
    setDownloadingBvid(item.bvid)
    try {
      const preferredTitle = `${track.artists || '未知'} - ${track.name}`
      const result = await downloadBilibili(item.bvid, preferredTitle)
      setLastPath(result.path)
      toast('已下载到 downloads/bilibili-sniff', 'success')
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'danger')
    } finally {
      setDownloadingBvid(null)
    }
  }

  if (typeof document === 'undefined') return null

  return createPortal(
    <AnimatePresence>
      {open && track && (
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
            aria-labelledby="resource-sniff-title"
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="relative z-10 flex max-h-[min(88vh,720px)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-xl"
          >
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border-subtle px-5 py-4">
              <div className="min-w-0">
                <h2
                  id="resource-sniff-title"
                  className="font-display text-base font-semibold tracking-tight text-foreground"
                >
                  资源嗅探
                </h2>
                <p className="mt-1 truncate text-xs text-muted">
                  {track.name}
                  <span className="text-subtle"> · </span>
                  {track.artists || '未知歌手'}
                  <span className="text-subtle"> · 源：B站 · 下载含视频+音频</span>
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

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              {loading && (
                <p className="flex items-center gap-2 text-xs text-muted" role="status">
                  <FontAwesomeIcon icon={faSpinner} className="h-3 w-3 animate-spin" />
                  正在 B 站搜索…
                </p>
              )}
              {error && !loading && (
                <p className="text-xs text-danger" role="alert">
                  {error}
                </p>
              )}
              {!loading && !error && items.length === 0 && (
                <p className="text-xs text-muted">未找到相关稿件</p>
              )}
              {!loading && items.length > 0 && (
                <ul className="space-y-2">
                  {items.map((item) => {
                    const delta = formatDelta(item.durationDeltaMs)
                    const busy = downloadingBvid === item.bvid
                    return (
                      <li
                        key={item.bvid}
                        className="flex gap-3 rounded-xl border border-border-subtle bg-background/40 p-3"
                      >
                        {item.cover ? (
                          <img
                            src={item.cover}
                            alt=""
                            className="h-14 w-20 shrink-0 rounded-lg object-cover"
                            loading="lazy"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <div className="h-14 w-20 shrink-0 rounded-lg bg-surface-hover" />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="line-clamp-2 text-xs font-medium text-foreground">
                            {item.title}
                          </p>
                          <p className="mt-1 truncate text-[11px] text-subtle">
                            {item.author}
                            <span className="mx-1">·</span>
                            {item.durationText}
                            <span className="mx-1">·</span>
                            {formatPlay(item.play)} 播放
                            {delta ? (
                              <>
                                <span className="mx-1">·</span>
                                <span className="text-muted">{delta}</span>
                              </>
                            ) : null}
                          </p>
                          <p className="mt-0.5 truncate text-[10px] text-subtle">{item.bvid}</p>
                        </div>
                        <button
                          type="button"
                          disabled={downloadingBvid !== null}
                          onClick={() => void handleDownload(item)}
                          className="inline-flex h-8 shrink-0 items-center gap-1.5 self-center rounded-xl border border-border bg-surface px-2.5 text-[11px] text-foreground transition-all duration-200 hover:border-muted hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <FontAwesomeIcon
                            icon={busy ? faSpinner : faDownload}
                            className={`h-3 w-3 ${busy ? 'animate-spin' : ''}`}
                          />
                          {busy ? '下载中' : '下载'}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>

            {lastPath && (
              <div className="shrink-0 border-t border-border-subtle px-5 py-3">
                <button
                  type="button"
                  onClick={() => void revealItemInDir(lastPath)}
                  className="inline-flex items-center gap-1.5 text-[11px] text-muted transition-colors hover:text-foreground"
                >
                  <FontAwesomeIcon icon={faFolderOpen} className="h-3 w-3" />
                  打开所在目录
                </button>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
