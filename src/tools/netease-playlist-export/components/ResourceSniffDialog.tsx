import { useEffect, useRef, useState } from 'react'
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
  downloadBilibili,
  searchBilibili,
  type BiliDownloadedEntry,
  type BiliSearchItem,
} from '../api/bilibiliSniff'
import type { NeteasePlaylist, NeteaseTrack } from '../types'

export type SniffAutoOutcome =
  | { status: 'downloaded'; entry: BiliDownloadedEntry }
  | { status: 'empty' }
  | { status: 'error'; message: string }
  | { status: 'aborted' }

interface ResourceSniffDialogProps {
  open: boolean
  track: NeteaseTrack | null
  playlist: NeteasePlaylist | null
  downloadedEntry?: BiliDownloadedEntry | null
  /** 批量模式：搜索结果展示后，随机等待 1–3 秒再下载第一条 */
  autoDownloadFirst?: boolean
  onClose: () => void
  onDownloaded?: (entry: BiliDownloadedEntry) => void
  onAutoFinished?: (outcome: SniffAutoOutcome) => void
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

function randomIntInclusive(min: number, max: number) {
  return min + Math.floor(Math.random() * (max - min + 1))
}

export function ResourceSniffDialog({
  open,
  track,
  playlist,
  downloadedEntry = null,
  autoDownloadFirst = false,
  onClose,
  onDownloaded,
  onAutoFinished,
}: ResourceSniffDialogProps) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [items, setItems] = useState<BiliSearchItem[]>([])
  const [downloadingBvid, setDownloadingBvid] = useState<string | null>(null)
  const [lastPath, setLastPath] = useState<string | null>(null)
  const [autoStatus, setAutoStatus] = useState<string | null>(null)
  const [autoTargetBvid, setAutoTargetBvid] = useState<string | null>(null)

  const abortRef = useRef(false)
  const autoStartedRef = useRef(false)
  const searchGenRef = useRef(0)
  const [readySearchGen, setReadySearchGen] = useState(0)
  const onAutoFinishedRef = useRef(onAutoFinished)
  onAutoFinishedRef.current = onAutoFinished
  const onDownloadedRef = useRef(onDownloaded)
  onDownloadedRef.current = onDownloaded

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !autoDownloadFirst) onClose()
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose, autoDownloadFirst])

  useEffect(() => {
    if (!open || !track) return
    let cancelled = false
    const gen = ++searchGenRef.current
    abortRef.current = false
    autoStartedRef.current = false
    setLoading(true)
    setError(null)
    setItems([])
    setLastPath(null)
    setReadySearchGen(0)
    setAutoStatus(autoDownloadFirst ? '正在 B 站搜索…' : null)
    setAutoTargetBvid(null)
    const keyword = [track.name, track.artists].filter(Boolean).join(' ')
    const durationMs = track.durationMs || undefined
    void (async () => {
      try {
        const result = await searchBilibili(keyword, durationMs)
        if (cancelled || gen !== searchGenRef.current) return
        setItems(result)
        setReadySearchGen(gen)
      } catch (e) {
        if (cancelled || gen !== searchGenRef.current) return
        const message = e instanceof Error ? e.message : String(e)
        setError(message)
        setReadySearchGen(gen)
        if (autoDownloadFirst) {
          onAutoFinishedRef.current?.({ status: 'error', message })
        }
      } finally {
        if (!cancelled && gen === searchGenRef.current) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, track?.songId, autoDownloadFirst])

  // 批量：仅在「当前这一轮搜索完成」后触发，避免吃到上一首歌的残留 items
  useEffect(() => {
    if (!open || !track || !autoDownloadFirst) return
    if (loading || error) return
    if (readySearchGen === 0 || readySearchGen !== searchGenRef.current) return
    if (autoStartedRef.current) return

    if (items.length === 0) {
      autoStartedRef.current = true
      setAutoStatus('未找到相关稿件，跳过')
      onAutoFinishedRef.current?.({ status: 'empty' })
      return
    }

    autoStartedRef.current = true
    const first = items[0]
    if (!first) {
      setAutoStatus('未找到相关稿件，跳过')
      onAutoFinishedRef.current?.({ status: 'empty' })
      return
    }
    const currentTrack = track
    setAutoTargetBvid(first.bvid)
    const waitSec = randomIntInclusive(1, 3)
    setAutoStatus(`资源已展示，${waitSec}s 后下载首个结果…`)

    let cancelled = false
    const startedGen = readySearchGen
    const timer = window.setTimeout(() => {
      if (cancelled || startedGen !== searchGenRef.current) {
        onAutoFinishedRef.current?.({ status: 'aborted' })
        return
      }
      void (async () => {
        setDownloadingBvid(first.bvid)
        setAutoStatus('正在下载首个资源…')
        try {
          const preferredTitle = `${currentTrack.artists || '未知'} - ${currentTrack.name}`
          const result = await downloadBilibili({
            bvid: first.bvid,
            songId: currentTrack.songId,
            playlistId: playlist?.id,
            playlistName: playlist?.name,
            preferredTitle,
            artists: currentTrack.artists,
          })
          if (startedGen !== searchGenRef.current) {
            onAutoFinishedRef.current?.({ status: 'aborted' })
            return
          }
          setLastPath(result.path)
          const entry: BiliDownloadedEntry = {
            songId: currentTrack.songId,
            playlistId: playlist?.id ?? null,
            playlistName: playlist?.name ?? null,
            path: result.path,
            bvid: result.bvid,
            title: preferredTitle,
            artists: currentTrack.artists || null,
            downloadedAt: Math.floor(Date.now() / 1000),
          }
          onDownloadedRef.current?.(entry)
          setAutoStatus('下载完成')
          onAutoFinishedRef.current?.({ status: 'downloaded', entry })
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e)
          setAutoStatus(`下载失败：${message}`)
          if (startedGen === searchGenRef.current) {
            onAutoFinishedRef.current?.({ status: 'error', message })
          }
        } finally {
          setDownloadingBvid(null)
        }
      })()
    }, waitSec * 1000)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [
    open,
    track,
    autoDownloadFirst,
    loading,
    error,
    items,
    playlist,
    readySearchGen,
  ])

  const handleDownload = async (item: BiliSearchItem) => {
    if (!track || autoDownloadFirst) return
    setDownloadingBvid(item.bvid)
    try {
      const preferredTitle = `${track.artists || '未知'} - ${track.name}`
      const result = await downloadBilibili({
        bvid: item.bvid,
        songId: track.songId,
        playlistId: playlist?.id,
        playlistName: playlist?.name,
        preferredTitle,
        artists: track.artists,
      })
      setLastPath(result.path)
      onDownloaded?.({
        songId: track.songId,
        playlistId: playlist?.id ?? null,
        playlistName: playlist?.name ?? null,
        path: result.path,
        bvid: result.bvid,
        title: preferredTitle,
        artists: track.artists || null,
        downloadedAt: Math.floor(Date.now() / 1000),
      })
      const folder = playlist?.name ? `downloads/网易云音乐/${playlist.name}` : 'downloads/网易云音乐'
      toast(`已下载到 ${folder}`, 'success')
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'danger')
    } finally {
      setDownloadingBvid(null)
    }
  }

  const handleClose = () => {
    if (autoDownloadFirst) {
      abortRef.current = true
      onAutoFinishedRef.current?.({ status: 'aborted' })
    }
    onClose()
  }

  const openPath = lastPath ?? downloadedEntry?.path ?? null

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
          {autoDownloadFirst ? (
            <div className="absolute inset-0 bg-black/55" aria-hidden />
          ) : (
            <button
              type="button"
              aria-label="关闭"
              className="absolute inset-0 bg-black/55"
              onClick={onClose}
            />
          )}
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="resource-sniff-title"
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="relative z-10 flex h-[min(88vh,720px)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-xl"
          >
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border-subtle px-5 py-4">
              <div className="min-w-0">
                <h2
                  id="resource-sniff-title"
                  className="font-display text-base font-semibold tracking-tight text-foreground"
                >
                  资源嗅探
                  {autoDownloadFirst ? (
                    <span className="ml-2 text-xs font-normal text-muted">批量中</span>
                  ) : null}
                </h2>
                <p className="mt-1 truncate text-xs text-muted">
                  {track.name}
                  <span className="text-subtle"> · </span>
                  {track.artists || '未知歌手'}
                  <span className="text-subtle"> · 源：B站 · 下载含视频+音频</span>
                </p>
                {autoStatus && (
                  <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted">
                    {(loading || downloadingBvid) && (
                      <FontAwesomeIcon icon={faSpinner} className="h-2.5 w-2.5 animate-spin" />
                    )}
                    {autoStatus}
                  </p>
                )}
              </div>
              {!autoDownloadFirst && (
                <button
                  type="button"
                  onClick={handleClose}
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-subtle transition-colors hover:bg-surface-hover hover:text-foreground"
                  aria-label="关闭弹框"
                >
                  <FontAwesomeIcon icon={faXmark} className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              {loading && (
                <div
                  className="flex h-full min-h-[12rem] items-center justify-center gap-2 text-xs text-muted"
                  role="status"
                >
                  <FontAwesomeIcon icon={faSpinner} className="h-3.5 w-3.5 animate-spin" />
                  正在 B 站搜索…
                </div>
              )}
              {error && !loading && (
                <div className="flex h-full min-h-[12rem] items-center justify-center px-6" role="alert">
                  <p className="text-center text-xs text-danger">{error}</p>
                </div>
              )}
              {!loading && !error && items.length === 0 && (
                <div className="flex h-full min-h-[12rem] items-center justify-center">
                  <p className="text-xs text-muted">未找到相关稿件</p>
                </div>
              )}
              {!loading && items.length > 0 && (
                <ul className="space-y-2">
                  {items.map((item) => {
                    const delta = formatDelta(item.durationDeltaMs)
                    const busy = downloadingBvid === item.bvid
                    const alreadyDownloaded =
                      !!downloadedEntry && downloadedEntry.bvid === item.bvid
                    const isAutoTarget = autoTargetBvid === item.bvid
                    return (
                      <li
                        key={item.bvid}
                        className={`flex gap-3 rounded-xl border p-3 transition-colors duration-200 ${
                          isAutoTarget
                            ? 'border-foreground/25 bg-surface-hover/60'
                            : alreadyDownloaded
                              ? 'border-success/40 bg-success/10'
                              : 'border-border-subtle bg-background/40'
                        }`}
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
                          disabled={
                            alreadyDownloaded ||
                            downloadingBvid !== null ||
                            autoDownloadFirst
                          }
                          onClick={() => void handleDownload(item)}
                          aria-busy={busy}
                          title={
                            alreadyDownloaded
                              ? downloadedEntry?.path ?? '已下载'
                              : undefined
                          }
                          className={`inline-flex h-8 w-[5rem] shrink-0 items-center justify-center gap-1.5 self-center rounded-xl border px-2 text-[11px] transition-all duration-200 ${
                            alreadyDownloaded
                              ? 'cursor-default border-success/35 bg-success/15 text-success'
                              : busy
                                ? 'cursor-wait border-muted bg-surface-hover text-foreground'
                                : 'border-border bg-surface text-foreground hover:border-muted hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-40'
                          }`}
                        >
                          <FontAwesomeIcon
                            icon={
                              alreadyDownloaded
                                ? faCircleCheck
                                : busy
                                  ? faSpinner
                                  : faDownload
                            }
                            className={`h-3 w-3 shrink-0 ${busy ? 'animate-spin' : ''}`}
                          />
                          <span className="leading-none">
                            {alreadyDownloaded ? '已下载' : busy ? '下载中' : '下载'}
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>

            {openPath && (
              <div className="shrink-0 border-t border-border-subtle px-5 py-3">
                <button
                  type="button"
                  onClick={() => void revealItemInDir(openPath)}
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
