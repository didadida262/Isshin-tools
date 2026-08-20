import { useCallback, useEffect, useRef, useState } from 'react'
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
import { useToolVisible } from '@/shell/ToolVisibility'
import { TASK_IDS, upsertTask } from '@/tasks'
import {
  downloadBilibili,
  searchBilibili,
  type BiliDownloadedEntry,
  type BiliSearchItem,
} from '../api/bilibiliSniff'
import type { SniffAutoOutcome } from '../lib/autoSniffDownload'
import type { NeteasePlaylist, NeteaseTrack } from '../types'
import { SniffVideoDetailDialog } from './SniffVideoDetailDialog'

export type { SniffAutoOutcome } from '../lib/autoSniffDownload'

interface ResourceSniffDialogProps {
  open: boolean
  track: NeteaseTrack | null
  playlist: NeteasePlaylist | null
  playlistIndex?: number
  playlistTotal?: number
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
  playlistIndex,
  playlistTotal,
  downloadedEntry = null,
  autoDownloadFirst = false,
  onClose,
  onDownloaded,
  onAutoFinished,
}: ResourceSniffDialogProps) {
  const { toast } = useToast()
  const toolVisible = useToolVisible()
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [items, setItems] = useState<BiliSearchItem[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [downloadingBvid, setDownloadingBvid] = useState<string | null>(null)
  const [lastPath, setLastPath] = useState<string | null>(null)
  const [lastDownloadedBvid, setLastDownloadedBvid] = useState<string | null>(null)
  const [selectedItem, setSelectedItem] = useState<BiliSearchItem | null>(null)
  const [autoStatus, setAutoStatus] = useState<string | null>(null)
  const [autoTargetBvid, setAutoTargetBvid] = useState<string | null>(null)

  const abortRef = useRef(false)
  const autoStartedRef = useRef(false)
  const searchGenRef = useRef(0)
  const pageRef = useRef(1)
  const hasMoreRef = useRef(false)
  const loadingMoreRef = useRef(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const [readySearchGen, setReadySearchGen] = useState(0)
  const onAutoFinishedRef = useRef(onAutoFinished)
  onAutoFinishedRef.current = onAutoFinished
  const onDownloadedRef = useRef(onDownloaded)
  onDownloadedRef.current = onDownloaded

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || autoDownloadFirst) return
      if (selectedItem) return
      onClose()
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose, autoDownloadFirst, selectedItem])

  useEffect(() => {
    if (!open || !track) return
    let cancelled = false
    const gen = ++searchGenRef.current
    abortRef.current = false
    autoStartedRef.current = false
    setLoading(true)
    setLoadingMore(false)
    setError(null)
    setItems([])
    setHasMore(false)
    setLastPath(null)
    setLastDownloadedBvid(null)
    setSelectedItem(null)
    setReadySearchGen(0)
    pageRef.current = 1
    hasMoreRef.current = false
    loadingMoreRef.current = false
    setAutoStatus(autoDownloadFirst ? '正在 B 站搜索…' : null)
    setAutoTargetBvid(null)
    const keyword = [track.name, track.artists, 'MV'].filter(Boolean).join(' ')
    const durationMs = track.durationMs || undefined

    const sleepSec = (sec: number) =>
      new Promise<void>((resolve) => {
        window.setTimeout(resolve, sec * 1000)
      })

    // 空结果 / 限流时多等一会再搜；过一会儿往往就恢复了
    const EMPTY_RETRY_MAX = 3
    const EMPTY_WAIT_MIN = 8
    const EMPTY_WAIT_MAX = 20

    void (async () => {
      let attempt = 0
      while (!cancelled && gen === searchGenRef.current) {
        attempt += 1
        try {
          if (autoDownloadFirst) {
            setAutoStatus(
              attempt === 1
                ? '正在 B 站搜索…'
                : `正在重试搜索（第 ${attempt}/${EMPTY_RETRY_MAX} 次）…`,
            )
          }
          setLoading(true)
          const result = await searchBilibili(keyword, durationMs, 1)
          if (cancelled || gen !== searchGenRef.current) return

          if (
            autoDownloadFirst &&
            result.items.length === 0 &&
            attempt < EMPTY_RETRY_MAX
          ) {
            const waitSec = randomIntInclusive(EMPTY_WAIT_MIN, EMPTY_WAIT_MAX)
            setLoading(false)
            setItems([])
            setAutoStatus(
              `搜索结果为空，疑似短暂限流，${waitSec}s 后重试（${attempt}/${EMPTY_RETRY_MAX}）…`,
            )
            await sleepSec(waitSec)
            if (cancelled || gen !== searchGenRef.current) return
            continue
          }

          setItems(result.items)
          pageRef.current = result.page
          hasMoreRef.current = result.hasMore && !autoDownloadFirst
          setHasMore(hasMoreRef.current)
          setReadySearchGen(gen)
          setLoading(false)
          return
        } catch (e) {
          if (cancelled || gen !== searchGenRef.current) return
          const message = e instanceof Error ? e.message : String(e)
          const looksLikeLimit =
            /频繁|风控|限流|412|403|429|empty|空/i.test(message) ||
            message.includes('-412') ||
            message.includes('412')

          if (autoDownloadFirst && looksLikeLimit && attempt < EMPTY_RETRY_MAX) {
            const waitSec = randomIntInclusive(EMPTY_WAIT_MIN, EMPTY_WAIT_MAX)
            setLoading(false)
            setError(null)
            setAutoStatus(
              `搜索异常（${message}），${waitSec}s 后重试（${attempt}/${EMPTY_RETRY_MAX}）…`,
            )
            await sleepSec(waitSec)
            if (cancelled || gen !== searchGenRef.current) return
            continue
          }

          setError(message)
          setReadySearchGen(gen)
          setLoading(false)
          if (autoDownloadFirst) {
            onAutoFinishedRef.current?.({ status: 'error', message })
          }
          return
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, track?.songId, autoDownloadFirst])

  const loadMore = useCallback(async () => {
    if (!open || !track || autoDownloadFirst) return
    if (!hasMoreRef.current || loadingMoreRef.current) return
    const gen = searchGenRef.current
    const nextPage = pageRef.current + 1
    loadingMoreRef.current = true
    setLoadingMore(true)
    const keyword = [track.name, track.artists, 'MV'].filter(Boolean).join(' ')
    const durationMs = track.durationMs || undefined
    try {
      const result = await searchBilibili(keyword, durationMs, nextPage)
      if (gen !== searchGenRef.current) return
      setItems((prev) => {
        const seen = new Set(prev.map((item) => item.bvid))
        const extra = result.items.filter((item) => !seen.has(item.bvid))
        return extra.length > 0 ? [...prev, ...extra] : prev
      })
      pageRef.current = result.page
      hasMoreRef.current = result.hasMore && result.items.length > 0
      setHasMore(hasMoreRef.current)
    } catch (e) {
      if (gen !== searchGenRef.current) return
      toast(e instanceof Error ? e.message : String(e), 'danger')
    } finally {
      if (gen === searchGenRef.current) {
        loadingMoreRef.current = false
        setLoadingMore(false)
      }
    }
  }, [open, track, autoDownloadFirst, toast])

  useEffect(() => {
    const root = scrollRef.current
    const sentinel = sentinelRef.current
    if (!root || !sentinel || !hasMore || loading || autoDownloadFirst) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void loadMore()
      },
      { root, rootMargin: '80px 0px', threshold: 0 },
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasMore, loading, items.length, autoDownloadFirst, loadMore])

  // 批量：当前搜索完成后，按结果依次尝试下载；取流失败则换下一条
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
    const candidates = [...items]
    const currentTrack = track
    const startedGen = readySearchGen
    let cancelled = false

    const sleepSec = (sec: number) =>
      new Promise<void>((resolve) => {
        window.setTimeout(resolve, sec * 1000)
      })

    void (async () => {
      for (let i = 0; i < candidates.length; i += 1) {
        if (cancelled || startedGen !== searchGenRef.current) {
          onAutoFinishedRef.current?.({ status: 'aborted' })
          return
        }

        const item = candidates[i]
        if (!item) continue

        setAutoTargetBvid(item.bvid)
        const waitSec = randomIntInclusive(1, 3)
        setAutoStatus(
          i === 0
            ? `资源已展示，${waitSec}s 后下载第 1 个结果…`
            : `上一条取流失败，${waitSec}s 后尝试第 ${i + 1} 个结果…`,
        )
        await sleepSec(waitSec)

        if (cancelled || startedGen !== searchGenRef.current) {
          onAutoFinishedRef.current?.({ status: 'aborted' })
          return
        }

        setDownloadingBvid(item.bvid)
        setAutoStatus(`正在下载第 ${i + 1}/${candidates.length} 个资源…`)
        try {
          const preferredTitle = `${currentTrack.artists || '未知'} - ${currentTrack.name}`
          const result = await downloadBilibili({
            bvid: item.bvid,
            songId: currentTrack.songId,
            playlistId: playlist?.id,
            playlistName: playlist?.name,
            preferredTitle,
            artists: currentTrack.artists,
            playlistIndex,
            playlistTotal,
          })
          if (cancelled || startedGen !== searchGenRef.current) {
            onAutoFinishedRef.current?.({ status: 'aborted' })
            return
          }
          setLastPath(result.path)
          setLastDownloadedBvid(result.bvid)
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
          setAutoStatus(`下载完成（第 ${i + 1} 个结果）`)
          setDownloadingBvid(null)
          onAutoFinishedRef.current?.({ status: 'downloaded', entry })
          return
        } catch (e) {
          setDownloadingBvid(null)
          const message = e instanceof Error ? e.message : String(e)
          setAutoStatus(`第 ${i + 1} 个失败：${message}`)
          // 还有下一条则继续；否则本曲跳过
          if (i >= candidates.length - 1) {
            if (startedGen === searchGenRef.current) {
              setAutoStatus(`全部 ${candidates.length} 个结果均失败，跳过`)
              onAutoFinishedRef.current?.({ status: 'empty' })
            }
            return
          }
        }
      }

      if (startedGen === searchGenRef.current) {
        onAutoFinishedRef.current?.({ status: 'empty' })
      }
    })()

    return () => {
      cancelled = true
    }
  }, [
    open,
    track,
    autoDownloadFirst,
    loading,
    error,
    items,
    playlist,
    playlistIndex,
    playlistTotal,
    readySearchGen,
  ])

  const handleDownload = async (item: BiliSearchItem) => {
    if (!track || autoDownloadFirst) return
    const taskId = TASK_IDS.neteaseSingle(track.songId)
    const preferredTitle = `${track.artists || '未知'} - ${track.name}`
    setDownloadingBvid(item.bvid)
    upsertTask({
      id: taskId,
      source: 'netease',
      sourceLabel: '网易云音乐下载器',
      title: '下载曲目',
      detail: preferredTitle,
      status: 'running',
    })
    try {
      const result = await downloadBilibili({
        bvid: item.bvid,
        songId: track.songId,
        playlistId: playlist?.id,
        playlistName: playlist?.name,
        preferredTitle,
        artists: track.artists,
        playlistIndex,
        playlistTotal,
      })
      setLastPath(result.path)
      setLastDownloadedBvid(result.bvid)
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
      upsertTask({
        id: taskId,
        source: 'netease',
        sourceLabel: '网易云音乐下载器',
        title: '下载曲目',
        detail: `已保存：${preferredTitle}`,
        status: 'success',
      })
      const folder = playlist?.name ? `downloads/网易云音乐/${playlist.name}` : 'downloads/网易云音乐'
      toast(`已下载到 ${folder}`, 'success')
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      upsertTask({
        id: taskId,
        source: 'netease',
        sourceLabel: '网易云音乐下载器',
        title: '下载曲目',
        detail: message,
        status: 'error',
      })
      toast(message, 'danger')
    } finally {
      setDownloadingBvid(null)
    }
  }

  const handleClose = () => {
    if (autoDownloadFirst) {
      abortRef.current = true
      onAutoFinishedRef.current?.({ status: 'aborted' })
    }
    setSelectedItem(null)
    onClose()
  }

  const openPath = lastPath ?? downloadedEntry?.path ?? null
  const detailOpenPath =
    selectedItem == null
      ? null
      : downloadedEntry?.bvid === selectedItem.bvid
        ? (lastDownloadedBvid === selectedItem.bvid ? lastPath : null) ??
          downloadedEntry.path
        : lastDownloadedBvid === selectedItem.bvid
          ? lastPath
          : null
  const detailAlreadyDownloaded =
    !!selectedItem &&
    !!downloadedEntry &&
    downloadedEntry.bvid === selectedItem.bvid

  if (typeof document === 'undefined' || !toolVisible) return null

  return createPortal(
    <>
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
                onClick={handleClose}
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
                    <span className="text-subtle"> · MV · 源：B站 · 下载含视频+音频</span>
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

              <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                {loading && items.length === 0 && (
                  <div
                    className="flex h-full min-h-[12rem] items-center justify-center gap-2 text-xs text-muted"
                    role="status"
                  >
                    <FontAwesomeIcon icon={faSpinner} className="h-3.5 w-3.5 animate-spin" />
                    正在 B 站搜索…
                  </div>
                )}
                {error && !loading && items.length === 0 && (
                  <div className="flex h-full min-h-[12rem] items-center justify-center px-6" role="alert">
                    <p className="text-center text-xs text-danger">{error}</p>
                  </div>
                )}
                {!loading && !error && items.length === 0 && (
                  <div className="flex h-full min-h-[12rem] items-center justify-center">
                    <p className="text-xs text-muted">未找到相关稿件</p>
                  </div>
                )}
                {items.length > 0 && (
                  <ul className="space-y-2">
                    {items.map((item) => {
                      const delta = formatDelta(item.durationDeltaMs)
                      const busy = downloadingBvid === item.bvid
                      const alreadyDownloaded =
                        !!downloadedEntry && downloadedEntry.bvid === item.bvid
                      const isAutoTarget = autoTargetBvid === item.bvid
                      const canOpenDetail = !autoDownloadFirst
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
                          <button
                            type="button"
                            disabled={!canOpenDetail}
                            onClick={() => setSelectedItem(item)}
                            className={`flex min-w-0 flex-1 gap-3 text-left ${
                              canOpenDetail
                                ? 'cursor-pointer rounded-lg outline-offset-2 hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-foreground/30'
                                : 'cursor-default'
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
                          </button>
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
                {items.length > 0 && !autoDownloadFirst && (
                  <div ref={sentinelRef} className="flex h-10 items-center justify-center">
                    {hasMore ? (
                      <p className="flex items-center gap-1.5 text-[11px] text-subtle">
                        {loadingMore && (
                          <FontAwesomeIcon icon={faSpinner} className="h-2.5 w-2.5 animate-spin" />
                        )}
                        {loadingMore ? '加载更多…' : ''}
                      </p>
                    ) : (
                      <p className="text-[11px] text-subtle">已加载全部</p>
                    )}
                  </div>
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
      </AnimatePresence>

      <SniffVideoDetailDialog
        open={open && selectedItem !== null && !autoDownloadFirst}
        item={selectedItem}
        alreadyDownloaded={detailAlreadyDownloaded}
        downloading={!!selectedItem && downloadingBvid === selectedItem.bvid}
        openPath={detailOpenPath}
        downloadDisabled={downloadingBvid !== null}
        onClose={handleClose}
        onDownload={(item) => void handleDownload(item)}
      />
    </>,
    document.body,
  )
}
