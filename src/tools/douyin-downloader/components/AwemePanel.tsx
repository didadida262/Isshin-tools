import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useVirtualizer } from '@tanstack/react-virtual'
import { readFile } from '@tauri-apps/plugin-fs'
import { AnimatePresence, motion } from 'framer-motion'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faCircleCheck,
  faDownload,
  faFolderOpen,
  faHeart,
  faLayerGroup,
  faListOl,
  faSpinner,
  faStop,
  faTriangleExclamation,
  faXmark,
} from '@fortawesome/free-solid-svg-icons'
import { ErrorState } from '@/components/ErrorState'
import { useToast } from '@/components/Toast'
import { useToolVisible } from '@/shell/ToolVisibility'
import { TASK_IDS, upsertTask } from '@/tasks'
import { cachePreview, downloadAweme, unlikeAweme, applyAwemeSeq } from '../api/douyinApi'
import { useBatchDownload } from '../hooks/useBatchDownload'
import { useBatchUnlike } from '../hooks/useBatchUnlike'
import { kindFolder } from '../hooks/useDownloadedAweme'
import type { LoadMoreOutcome } from '../hooks/useAwemeList'
import type { DouyinAweme, DouyinDownloadedEntry, DouyinListKind } from '../types'
import { kindBatchDownloadLabel, kindLabel, isMusicKind } from '../lib/kindLabel'
import { revealDownloaded } from '../lib/revealDownloaded'
import { awemeSeq, chronologicalAwemeIds } from '../lib/awemeOrder'
import {
  AWEME_ROW_HEIGHT,
  AwemeRow,
  awemeGridTemplate,
} from './AwemeRow'
import { MusicPreviewDialog } from './MusicPreviewDialog'

interface AwemePanelProps {
  kind: DouyinListKind
  sessionKey: string
  items: DouyinAweme[]
  loading: boolean
  error: string | null
  hasMore: boolean
  downloadedById: Map<string, DouyinDownloadedEntry>
  onRetry: () => void
  onLoadMore: () => Promise<LoadMoreOutcome>
  onDownloaded: (entry: DouyinDownloadedEntry) => void
  onReloadDownloaded: () => Promise<void>
  onRefreshAfterUnlike: () => Promise<{
    items: DouyinAweme[]
    hasMore: boolean
  } | null>
  onBatchActiveChange?: (active: boolean) => void
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

export function AwemePanel({
  kind,
  sessionKey,
  items,
  loading,
  error,
  hasMore,
  downloadedById,
  onRetry,
  onLoadMore,
  onDownloaded,
  onReloadDownloaded,
  onRefreshAfterUnlike,
  onBatchActiveChange,
}: AwemePanelProps) {
  const { toast } = useToast()
  const toolVisible = useToolVisible()
  const [selected, setSelected] = useState<DouyinAweme | null>(null)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [unlikingId, setUnlikingId] = useState<string | null>(null)
  const [lastPath, setLastPath] = useState<string | null>(null)
  const [previewSrc, setPreviewSrc] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const itemsRef = useRef(items)
  itemsRef.current = items
  const onLoadMoreRef = useRef(onLoadMore)
  onLoadMoreRef.current = onLoadMore
  const appliedSeqKey = useRef('')
  const anyBatchActiveRef = useRef(false)
  const [seqRenaming, setSeqRenaming] = useState(false)
  const seqRenamingRef = useRef(false)
  const downloadingIdRef = useRef<string | null>(null)
  const unlikingIdRef = useRef<string | null>(null)
  const selectedRef = useRef<DouyinAweme | null>(null)
  const downloadedByIdRef = useRef(downloadedById)
  downloadedByIdRef.current = downloadedById

  const rowVirtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => AWEME_ROW_HEIGHT,
    overscan: 10,
    getItemKey: (index) => items[index]?.awemeId ?? index,
  })
  const virtualizerRef = useRef(rowVirtualizer)
  virtualizerRef.current = rowVirtualizer

  const scrollToIndex = useCallback(
    (index: number, align: 'auto' | 'end' | 'start' | 'center' = 'auto') => {
      if (index < 0) return
      virtualizerRef.current.scrollToIndex(index, {
        align,
        behavior: 'auto',
      })
    },
    [],
  )

  const batchLoadMore = useCallback(async () => {
    const last = itemsRef.current.length - 1
    if (last >= 0) scrollToIndex(last, 'end')
    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, 80)
    })
    return onLoadMoreRef.current()
  }, [scrollToIndex])

  const batch = useBatchDownload({
    sessionKey,
    kind,
    items,
    hasMore,
    downloadedById,
    loadMore: batchLoadMore,
    onDownloaded,
  })

  const batchUnlike = useBatchUnlike({
    sessionKey,
    items,
    hasMore,
    loadMore: batchLoadMore,
    onRefreshAfterUnlike,
  })

  const anyBatchActive = batch.isActive || batchUnlike.isActive || seqRenaming
  const followActiveId = batch.activeId ?? batchUnlike.activeId
  const followPhase = batch.isActive ? batch.phase : batchUnlike.phase
  const followLoadMoreUsed = batch.isActive
    ? batch.loadMoreUsed
    : batchUnlike.loadMoreUsed
  const batchDownloadIndex = batch.activeId
    ? items.findIndex((item) => item.awemeId === batch.activeId)
    : -1

  const gridTemplate = useMemo(() => awemeGridTemplate(kind), [kind])

  useEffect(() => {
    onBatchActiveChange?.(anyBatchActive)
  }, [anyBatchActive, onBatchActiveChange])

  // 列表全部加载后，按「最底=1」给已下载文件加序号（与网易喜欢歌单一致）
  useEffect(() => {
    if (
      loading ||
      error ||
      hasMore ||
      anyBatchActive ||
      seqRenaming ||
      items.length === 0
    ) {
      return
    }
    const first = items[0]?.awemeId ?? ''
    const last = items[items.length - 1]?.awemeId ?? ''
    // Include download count so seq re-runs after batch download finishes
    // (list may complete before any files exist on disk).
    const key = `${kind}:${items.length}:${first}:${last}:dl${downloadedById.size}`
    if (appliedSeqKey.current === key) return
    appliedSeqKey.current = key
    void applyAwemeSeq(kind, chronologicalAwemeIds(items))
      .then(async (result) => {
        if (result.renamed > 0) {
          toast(`已按列表序号重命名 ${result.renamed} 个文件`, 'success')
          await onReloadDownloaded()
        }
      })
      .catch((e) => {
        appliedSeqKey.current = ''
        const message = e instanceof Error ? e.message : String(e)
        toast(`按序号重命名失败：${message}`, 'danger')
      })
  }, [
    kind,
    loading,
    error,
    hasMore,
    anyBatchActive,
    seqRenaming,
    items,
    downloadedById.size,
    onReloadDownloaded,
    toast,
  ])

  const runSeqRename = useCallback(
    async (ids: string[]) => {
      const result = await applyAwemeSeq(kind, ids)
      if (result.renamed > 0) {
        toast(`已按列表序号重命名 ${result.renamed} 个文件`, 'success')
        await onReloadDownloaded()
      } else {
        toast(
          result.skipped > 0
            ? `没有需要重命名的文件（跳过 ${result.skipped}）`
            : '文件名已是最新序号，无需改动',
          'neutral',
        )
      }
      return result
    },
    [kind, onReloadDownloaded, toast],
  )

  const handleSeqRenameClick = useCallback(async () => {
    if (
      seqRenamingRef.current ||
      anyBatchActiveRef.current ||
      downloadingIdRef.current ||
      unlikingIdRef.current
    ) {
      return
    }
    seqRenamingRef.current = true
    setSeqRenaming(true)
    appliedSeqKey.current = ''
    try {
      if (hasMore) {
        toast('正在加载全部列表以便编号…', 'neutral')
      }
      for (let i = 0; i < 2000; i++) {
        const outcome = await batchLoadMore()
        if (outcome.status === 'noop' && outcome.reason === 'no-more') break
        if (outcome.status === 'ok') {
          if (!outcome.hasMore) break
          await new Promise<void>((r) => window.setTimeout(r, 400))
          continue
        }
        if (outcome.status === 'empty') {
          toast(outcome.message, 'danger')
          return
        }
        if (outcome.status === 'error') {
          toast(`加载列表失败：${outcome.message}`, 'danger')
          return
        }
        if (outcome.status === 'noop' && outcome.reason === 'busy') {
          await new Promise<void>((r) => window.setTimeout(r, 300))
          continue
        }
        // missing-auth / other noop
        break
      }

      const list = itemsRef.current
      if (list.length === 0) {
        toast('当前没有可编号的条目', 'neutral')
        return
      }
      const ids = chronologicalAwemeIds(list)
      appliedSeqKey.current = `${kind}:${list.length}:${list[0]?.awemeId}:${list[list.length - 1]?.awemeId}:dl${downloadedByIdRef.current.size}`
      await runSeqRename(ids)
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'danger')
    } finally {
      seqRenamingRef.current = false
      setSeqRenaming(false)
    }
  }, [hasMore, kind, batchLoadMore, runSeqRename, toast])

  useEffect(() => {
    if (!selected) {
      setPreviewSrc((prev) => {
        if (prev?.startsWith('blob:')) URL.revokeObjectURL(prev)
        return null
      })
      setPreviewError(null)
      setPreviewLoading(false)
      return
    }
    let cancelled = false
    let objectUrl: string | null = null
    setPreviewLoading(true)
    setPreviewError(null)
    setPreviewSrc((prev) => {
      if (prev?.startsWith('blob:')) URL.revokeObjectURL(prev)
      return null
    })
    void (async () => {
      try {
        const path = await cachePreview({
          awemeId: selected.awemeId,
          playUrl: selected.playUrl,
          playUrls: selected.playUrlCandidates,
          kind,
        })
        // blob URL：WKWebView 下 convertFileSrc(asset://) 经常无法播放本地文件
        const bytes = await readFile(path)
        if (cancelled) return
        const lower = path.toLowerCase()
        const mime = isMusicKind(kind)
          ? lower.endsWith('.m4a')
            ? 'audio/mp4'
            : 'audio/mpeg'
          : 'video/mp4'
        const blob = new Blob([bytes], { type: mime })
        objectUrl = URL.createObjectURL(blob)
        setPreviewSrc(objectUrl)
      } catch (e) {
        if (cancelled) return
        setPreviewError(e instanceof Error ? e.message : String(e))
      } finally {
        if (!cancelled) setPreviewLoading(false)
      }
    })()
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [selected, kind])

  const goPreviewOffset = useCallback(
    (delta: number) => {
      const list = itemsRef.current
      const currentId = selectedRef.current?.awemeId
      const index = currentId
        ? list.findIndex((item) => item.awemeId === currentId)
        : -1
      if (index < 0) return
      const nextIndex = index + delta
      if (nextIndex < 0 || nextIndex >= list.length) return
      const next = list[nextIndex]
      if (!next) return
      setSelected(next)
      scrollToIndex(nextIndex, 'auto')
    },
    [scrollToIndex],
  )

  useEffect(() => {
    if (!selected) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelected(null)
        return
      }
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      e.preventDefault()
      goPreviewOffset(e.key === 'ArrowUp' ? -1 : 1)
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [selected, goPreviewOffset])

  const handleDownload = useCallback(
    async (item: DouyinAweme) => {
      if (
        downloadedByIdRef.current.has(item.awemeId) ||
        downloadingIdRef.current ||
        anyBatchActiveRef.current
      ) {
        return
      }
      const taskId = TASK_IDS.douyinSingle(item.awemeId)
      const title = item.desc || item.awemeId
      const order = hasMore ? undefined : awemeSeq(itemsRef.current, item.awemeId)
      setDownloadingId(item.awemeId)
      upsertTask({
        id: taskId,
        source: 'douyin',
        sourceLabel: '抖音下载器',
        title: isMusicKind(kind) ? '下载音乐' : '下载视频',
        detail: title,
        status: 'running',
      })
      try {
        const result = await downloadAweme({
          awemeId: item.awemeId,
          playUrl: item.playUrl,
          playUrls: item.playUrlCandidates,
          title,
          kind,
          seq: order?.seq,
          total: order?.total,
        })
        setLastPath(result.path)
        onDownloaded({
          awemeId: item.awemeId,
          kind: kindFolder(kind),
          path: result.path,
          title,
          downloadedAt: Math.floor(Date.now() / 1000),
        })
        upsertTask({
          id: taskId,
          source: 'douyin',
          sourceLabel: '抖音下载器',
          title: isMusicKind(kind) ? '下载音乐' : '下载视频',
          detail: `已保存：${title}`,
          status: 'success',
        })
        toast(`已下载到 downloads/抖音/${kindFolder(kind)}`, 'success')
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        upsertTask({
          id: taskId,
          source: 'douyin',
          sourceLabel: '抖音下载器',
          title: isMusicKind(kind) ? '下载音乐' : '下载视频',
          detail: message,
          status: 'error',
        })
        toast(message, 'danger')
      } finally {
        setDownloadingId(null)
      }
    },
    [kind, hasMore, onDownloaded, toast],
  )

  const handleUnlike = useCallback(
    async (item: DouyinAweme) => {
      if (kind !== 'favorite' || unlikingIdRef.current || anyBatchActiveRef.current) {
        return
      }
      const ok = window.confirm(
        `确定取消喜欢「${item.desc || item.awemeId}」？\n此操作会同步到抖音账号。`,
      )
      if (!ok) return
      setUnlikingId(item.awemeId)
      try {
        await unlikeAweme(item.awemeId)
        await onRefreshAfterUnlike()
        if (selectedRef.current?.awemeId === item.awemeId) setSelected(null)
        toast('已取消喜欢', 'success')
      } catch (e) {
        toast(e instanceof Error ? e.message : String(e), 'danger')
      } finally {
        setUnlikingId(null)
      }
    },
    [kind, onRefreshAfterUnlike, toast],
  )

  const handleSelect = useCallback((item: DouyinAweme) => {
    setSelected(item)
  }, [])

  const handleReveal = useCallback(
    (entry: DouyinDownloadedEntry) => {
      void revealDownloaded(entry, kind, onDownloaded).catch((e) => {
        const message = e instanceof Error ? e.message : String(e)
        toast(`无法打开文件位置：${message}`, 'danger')
        void onReloadDownloaded()
      })
    },
    [kind, onDownloaded, onReloadDownloaded, toast],
  )

  const selectedDownloaded = selected ? downloadedById.get(selected.awemeId) : undefined
  const selectedIndex = selected
    ? items.findIndex((item) => item.awemeId === selected.awemeId)
    : -1

  // 批量跟滚：用虚拟列表定位，instant 滚动避免 smooth 叠加重绘
  useEffect(() => {
    if (!followActiveId) return
    const index = itemsRef.current.findIndex((item) => item.awemeId === followActiveId)
    if (index < 0) return
    scrollToIndex(index, 'auto')
  }, [followActiveId, followPhase, scrollToIndex])

  useEffect(() => {
    if (followPhase !== 'loadingMore') return
    const last = items.length - 1
    if (last < 0) return
    scrollToIndex(last, 'end')
  }, [followPhase, followLoadMoreUsed, items.length, scrollToIndex])

  useEffect(() => {
    if (anyBatchActive && selected) setSelected(null)
  }, [anyBatchActive, selected])

  useEffect(() => {
    const root = scrollRef.current
    const sentinel = sentinelRef.current
    if (!root || !sentinel || !hasMore || loading || anyBatchActive) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) void onLoadMoreRef.current()
      },
      { root, rootMargin: '120px 0px', threshold: 0 },
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasMore, loading, items.length, anyBatchActive])

  const pendingCount = useMemo(
    () =>
      items.reduce((n, item) => {
        if (downloadedById.has(item.awemeId) || batch.skippedById.has(item.awemeId)) {
          return n
        }
        return n + 1
      }, 0),
    [items, downloadedById, batch.skippedById],
  )
  const busySingle = downloadingId !== null || unlikingId !== null
  const controlsLocked = anyBatchActive || busySingle
  anyBatchActiveRef.current = anyBatchActive
  downloadingIdRef.current = downloadingId
  unlikingIdRef.current = unlikingId
  selectedRef.current = selected
  const virtualItems = rowVirtualizer.getVirtualItems()

  const handleBatchClick = () => {
    if (batch.isActive) {
      batch.stop()
      return
    }
    if (batchUnlike.isActive) return
    if (pendingCount === 0 && !hasMore) {
      toast(isMusicKind(kind) ? '当前没有可下载的音乐' : '当前没有可下载的视频', 'neutral')
      return
    }
    batchUnlike.clearStopBanner()
    batch.clearStopBanner()
    void batch.start()
  }

  const handleBatchUnlikeClick = () => {
    if (batchUnlike.isActive) {
      batchUnlike.stop()
      return
    }
    if (batch.isActive) return
    if (items.length === 0 && !hasMore) {
      toast('当前没有可取消的喜欢', 'neutral')
      return
    }
    const ok = window.confirm(
      '确定批量取消喜欢？将按 1–3 秒随机间隔逐条取消，并持续加载直到没有更多内容。此操作会同步到抖音账号。',
    )
    if (!ok) return
    batch.clearStopBanner()
    batchUnlike.clearStopBanner()
    void batchUnlike.start()
  }

  return (
    <>
      <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-border-subtle bg-surface/60">
        <header className="shrink-0 border-b border-border-subtle px-4 py-3">
          <div className="flex flex-nowrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">
                {kindLabel(kind)}
              </p>
              <p className="mt-0.5 text-[11px] text-subtle">
                {items.length} 条已加载
                {pendingCount > 0 ? ` · ${pendingCount} 条未下载` : ''}
                {' · '}
                点击条目预览
              </p>
            </div>
            <div className="flex shrink-0 flex-nowrap items-center justify-end gap-2">
              <button
                type="button"
                disabled={controlsLocked || items.length === 0}
                onClick={() => void handleSeqRenameClick()}
                title="列表从下往上编号（最早=0001），写入文件名"
                className="inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border border-border bg-background px-3 text-[11px] text-foreground transition-colors hover:border-muted hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-40"
              >
                <FontAwesomeIcon
                  icon={seqRenaming ? faSpinner : faListOl}
                  className={`h-3 w-3 ${seqRenaming ? 'animate-spin' : ''}`}
                />
                {seqRenaming ? '编号中…' : '按序号重命名'}
              </button>
              {kind === 'favorite' && (
                <button
                  type="button"
                  disabled={
                    busySingle ||
                    batch.isActive ||
                    seqRenaming ||
                    (items.length === 0 && !hasMore && !batchUnlike.isActive)
                  }
                  onClick={handleBatchUnlikeClick}
                  className={`inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border px-3 text-[11px] transition-colors ${
                    batchUnlike.isActive
                      ? 'border-danger/35 bg-danger/10 text-danger hover:bg-danger/15'
                      : 'border-border bg-background text-foreground hover:border-muted hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-40'
                  }`}
                >
                  <FontAwesomeIcon
                    icon={
                      batchUnlike.isActive
                        ? batchUnlike.phase === 'stopping'
                          ? faSpinner
                          : faStop
                        : faHeart
                    }
                    className={`h-3 w-3 ${batchUnlike.phase === 'stopping' ? 'animate-spin' : ''}`}
                  />
                  {batchUnlike.isActive
                    ? batchUnlike.phase === 'stopping'
                      ? '正在停止'
                      : batchUnlike.phase === 'retrying'
                        ? '取消自动重试'
                        : '停止取消喜欢'
                    : '一键取消喜欢'}
                </button>
              )}
              <button
                type="button"
                disabled={
                  busySingle ||
                  batchUnlike.isActive ||
                  seqRenaming ||
                  (pendingCount === 0 && !hasMore && !batch.isActive)
                }
                onClick={handleBatchClick}
                className={`inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border px-3 text-[11px] transition-colors ${
                  batch.isActive
                    ? 'border-danger/35 bg-danger/10 text-danger hover:bg-danger/15'
                    : 'border-border bg-background text-foreground hover:border-muted hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-40'
                }`}
              >
                <FontAwesomeIcon
                  icon={
                    batch.isActive
                      ? batch.phase === 'stopping'
                        ? faSpinner
                        : faStop
                      : faLayerGroup
                  }
                  className={`h-3 w-3 ${batch.phase === 'stopping' ? 'animate-spin' : ''}`}
                />
                {batch.isActive
                  ? batch.phase === 'stopping'
                    ? '正在停止'
                    : batch.phase === 'retrying'
                      ? '取消自动重试'
                      : '停止批量'
                  : kindBatchDownloadLabel(kind)}
              </button>
            </div>
          </div>

          {(batch.isActive || batch.statusText) && (
            <p className="mt-2 text-[11px] text-muted">
              {batchDownloadIndex >= 0 && (
                <span className="tabular-nums text-subtle">#{batchDownloadIndex + 1} · </span>
              )}
              {batch.statusText || '批量下载进行中…'}
              <span className="text-subtle">
                {' '}
                · 成功 {batch.successCount}
                {batch.skipCount > 0 && (
                  <>
                    {' · '}
                    跳过 {batch.skipCount}
                  </>
                )}
                {' · '}
                加载更多 {batch.loadMoreUsed} 次
              </span>
            </p>
          )}

          {(batchUnlike.isActive || batchUnlike.statusText) && (
            <p className="mt-2 text-[11px] text-muted">
              {batchUnlike.statusText || '批量取消喜欢进行中…'}
              <span className="text-subtle">
                {' '}
                · 成功 {batchUnlike.successCount}
                {' · '}
                加载更多 {batchUnlike.loadMoreUsed} 次
              </span>
            </p>
          )}

          {batch.stopMessage && (!batch.isActive || batch.phase === 'retrying') && (
            <div
              className={`mt-2 flex items-start gap-2 rounded-xl border px-3 py-2 text-[11px] leading-relaxed ${
                batch.stopReason === 'risk' || batch.stopReason === 'error'
                  ? 'border-danger/30 bg-danger/10 text-danger'
                  : 'border-border-subtle bg-background/80 text-muted'
              }`}
              role="status"
            >
              {(batch.stopReason === 'risk' || batch.stopReason === 'error') && (
                <FontAwesomeIcon
                  icon={faTriangleExclamation}
                  className="mt-0.5 h-3 w-3 shrink-0"
                />
              )}
              <div className="min-w-0 flex-1">
                <p>{batch.stopMessage}</p>
              </div>
              <button
                type="button"
                onClick={batch.clearStopBanner}
                className="shrink-0 text-subtle transition-colors hover:text-foreground"
                aria-label="关闭提示"
              >
                <FontAwesomeIcon icon={faXmark} className="h-3 w-3" />
              </button>
            </div>
          )}

          {batchUnlike.stopMessage &&
            (!batchUnlike.isActive || batchUnlike.phase === 'retrying') && (
              <div
                className={`mt-2 flex items-start gap-2 rounded-xl border px-3 py-2 text-[11px] leading-relaxed ${
                  batchUnlike.stopReason === 'risk' || batchUnlike.stopReason === 'error'
                    ? 'border-danger/30 bg-danger/10 text-danger'
                    : 'border-border-subtle bg-background/80 text-muted'
                }`}
                role="status"
              >
                {(batchUnlike.stopReason === 'risk' ||
                  batchUnlike.stopReason === 'error') && (
                  <FontAwesomeIcon
                    icon={faTriangleExclamation}
                    className="mt-0.5 h-3 w-3 shrink-0"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p>{batchUnlike.stopMessage}</p>
                </div>
                <button
                  type="button"
                  onClick={batchUnlike.clearStopBanner}
                  className="shrink-0 text-subtle transition-colors hover:text-foreground"
                  aria-label="关闭提示"
                >
                  <FontAwesomeIcon icon={faXmark} className="h-3 w-3" />
                </button>
              </div>
            )}
        </header>

        {items.length > 0 && (
          <div
            role="row"
            className="grid shrink-0 border-b border-border-subtle bg-surface px-0 text-[10px] uppercase tracking-wider text-subtle"
            style={{ gridTemplateColumns: gridTemplate }}
          >
            <div className="px-2 py-2 text-right font-medium">#</div>
            <div className="px-3 py-2 font-medium">封面</div>
            <div className="px-2 py-2 font-medium">
              {isMusicKind(kind) ? '曲名' : '内容'}
            </div>
            <div className="px-2 py-2 font-medium">作者</div>
            <div className="px-2 py-2 text-right font-medium">
              {isMusicKind(kind) ? '使用' : '点赞'}
            </div>
            <div className="px-2 py-2 text-right font-medium">时长</div>
            <div className="whitespace-nowrap px-3 py-2 text-right font-medium">
              操作
            </div>
          </div>
        )}

        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
          {loading && items.length === 0 && (
            <p className="px-4 py-10 text-center text-xs text-muted">加载中…</p>
          )}
          {!loading && error && (
            <div className="p-4">
              <ErrorState message={error} onRetry={onRetry} title="列表加载失败" />
            </div>
          )}
          {!loading && !error && items.length === 0 && (
            <p className="px-4 py-10 text-center text-xs text-muted">暂无内容</p>
          )}
          {items.length > 0 && (
            <div
              role="rowgroup"
              className="relative w-full"
              style={{ height: rowVirtualizer.getTotalSize() }}
            >
              {virtualItems.map((virtualRow) => {
                const item = items[virtualRow.index]
                if (!item) return null
                const downloaded = downloadedById.get(item.awemeId)
                const skipped = batch.skippedById.get(item.awemeId)
                const busyDownload =
                  downloadingId === item.awemeId || batch.activeId === item.awemeId
                const busyUnlike =
                  unlikingId === item.awemeId || batchUnlike.activeId === item.awemeId
                const isBatchTarget =
                  batch.activeId === item.awemeId ||
                  batchUnlike.activeId === item.awemeId
                return (
                  <AwemeRow
                    key={item.awemeId}
                    item={item}
                    index={virtualRow.index}
                    kind={kind}
                    downloaded={downloaded}
                    skipped={skipped}
                    busyDownload={busyDownload}
                    busyUnlike={busyUnlike}
                    isBatchTarget={isBatchTarget}
                    anyBatchActive={anyBatchActive}
                    controlsLocked={controlsLocked}
                    onSelect={handleSelect}
                    onDownload={handleDownload}
                    onUnlike={handleUnlike}
                    onReveal={handleReveal}
                    style={{
                      height: virtualRow.size,
                      transform: `translateY(${virtualRow.start}px)`,
                      gridTemplateColumns: gridTemplate,
                    }}
                  />
                )
              })}
            </div>
          )}

          {items.length > 0 && (
            <div ref={sentinelRef} className="flex h-10 items-center justify-center">
              {hasMore ? (
                <p className="flex items-center gap-1.5 text-[11px] text-subtle">
                  {(loading || followPhase === 'loadingMore') && (
                    <FontAwesomeIcon icon={faSpinner} className="h-2.5 w-2.5 animate-spin" />
                  )}
                  {followPhase === 'loadingMore'
                    ? `批量加载更多（第 ${followLoadMoreUsed + 1} 次）…`
                    : loading
                      ? '加载中…'
                      : ''}
                </p>
              ) : (
                <p className="text-[11px] text-subtle">已加载全部</p>
              )}
            </div>
          )}
        </div>
      </section>

      {typeof document !== 'undefined' &&
        toolVisible &&
        createPortal(
          <AnimatePresence>
            {selected && (
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
                  className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
                  onClick={() => setSelected(null)}
                />
                {isMusicKind(kind) ? (
                  <MusicPreviewDialog
                    item={selected}
                    previewSrc={previewSrc}
                    previewLoading={previewLoading}
                    previewError={previewError}
                    downloaded={selectedDownloaded}
                    downloading={downloadingId === selected.awemeId}
                    controlsLocked={controlsLocked}
                    canReveal={!!(lastPath || selectedDownloaded?.path)}
                    hasPrev={selectedIndex > 0}
                    hasNext={selectedIndex >= 0 && selectedIndex < items.length - 1}
                    onClose={() => setSelected(null)}
                    onPrev={() => goPreviewOffset(-1)}
                    onNext={() => goPreviewOffset(1)}
                    onDownload={() => void handleDownload(selected)}
                    onReveal={() => {
                      const entry =
                        selectedDownloaded ??
                        (lastPath
                          ? {
                              awemeId: selected.awemeId,
                              kind: kindFolder(kind),
                              path: lastPath,
                              title: selected.desc || selected.awemeId,
                              downloadedAt: Math.floor(Date.now() / 1000),
                            }
                          : null)
                      if (entry) handleReveal(entry)
                    }}
                  />
                ) : (
                  <motion.div
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="aweme-preview-title"
                    initial={{ opacity: 0, y: 10, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 8, scale: 0.98 }}
                    transition={{ duration: 0.18, ease: 'easeOut' }}
                    className="relative z-10 flex h-[min(88vh,720px)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-xl"
                  >
                    <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border-subtle px-5 py-4">
                      <div className="min-w-0">
                        <h2
                          id="aweme-preview-title"
                          className="font-display text-base font-semibold tracking-tight text-foreground"
                        >
                          视频预览
                        </h2>
                        <p className="mt-1 line-clamp-2 text-xs text-muted">
                          {selected.desc || selected.awemeId}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelected(null)}
                        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-subtle transition-colors hover:bg-surface-hover hover:text-foreground"
                        aria-label="关闭弹框"
                      >
                        <FontAwesomeIcon icon={faXmark} className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <div className="flex min-h-0 flex-1 items-center justify-center bg-black/40 p-4">
                      {previewLoading && (
                        <p className="flex items-center gap-2 text-xs text-muted">
                          <FontAwesomeIcon icon={faSpinner} className="h-3 w-3 animate-spin" />
                          加载预览…
                        </p>
                      )}
                      {!previewLoading && previewError && (
                        <p className="px-4 text-center text-xs text-danger">{previewError}</p>
                      )}
                      {!previewLoading && !previewError && previewSrc ? (
                        <video
                          key={previewSrc}
                          src={previewSrc}
                          controls
                          autoPlay
                          playsInline
                          className="h-full max-h-full w-auto max-w-full rounded-xl object-contain"
                          poster={selected.coverUrl || undefined}
                        />
                      ) : null}
                    </div>

                    <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-border-subtle px-5 py-3">
                      <div className="min-w-0 text-[11px] text-subtle">
                        {selected.authorName || '未知作者'}
                        <span className="mx-1">·</span>
                        {formatDuration(selected.durationMs)}
                        <span className="mx-1">·</span>
                        {formatCount(selected.diggCount)} 赞
                      </div>
                      <div className="flex items-center gap-2">
                        {(lastPath || selectedDownloaded?.path) && (
                          <button
                            type="button"
                            onClick={() => {
                              const entry =
                                selectedDownloaded ??
                                (lastPath
                                  ? {
                                      awemeId: selected.awemeId,
                                      kind: kindFolder(kind),
                                      path: lastPath,
                                      title: selected.desc || selected.awemeId,
                                      downloadedAt: Math.floor(Date.now() / 1000),
                                    }
                                  : null)
                              if (entry) handleReveal(entry)
                            }}
                            className="inline-flex items-center gap-1.5 text-[11px] text-muted transition-colors hover:text-foreground"
                          >
                            <FontAwesomeIcon icon={faFolderOpen} className="h-3 w-3" />
                            打开目录
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={!!selectedDownloaded || controlsLocked}
                          onClick={() => void handleDownload(selected)}
                          className={`inline-flex h-8 min-w-[5.5rem] items-center justify-center gap-1.5 rounded-xl border px-3 text-[11px] transition-all ${
                            selectedDownloaded
                              ? 'cursor-default border-success/35 bg-success/15 text-success'
                              : downloadingId === selected.awemeId
                                ? 'cursor-wait border-muted bg-surface-hover text-foreground'
                                : 'border-border bg-background text-foreground hover:border-muted hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-40'
                          }`}
                        >
                          <FontAwesomeIcon
                            icon={
                              selectedDownloaded
                                ? faCircleCheck
                                : downloadingId === selected.awemeId
                                  ? faSpinner
                                  : faDownload
                            }
                            className={`h-3 w-3 ${
                              downloadingId === selected.awemeId ? 'animate-spin' : ''
                            }`}
                          />
                          {selectedDownloaded
                            ? '已下载'
                            : downloadingId === selected.awemeId
                              ? '下载中'
                              : '下载'}
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  )
}
