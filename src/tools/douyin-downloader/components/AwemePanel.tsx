import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { readFile } from '@tauri-apps/plugin-fs'
import { AnimatePresence, motion } from 'framer-motion'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faCircleCheck,
  faDownload,
  faFolderOpen,
  faLayerGroup,
  faSatelliteDish,
  faSpinner,
  faStop,
  faTriangleExclamation,
  faXmark,
} from '@fortawesome/free-solid-svg-icons'
import { revealItemInDir } from '@tauri-apps/plugin-opener'
import { ErrorState } from '@/components/ErrorState'
import { useToast } from '@/components/Toast'
import { cachePreview, downloadAweme } from '../api/douyinApi'
import { useBatchDownload } from '../hooks/useBatchDownload'
import { kindFolder } from '../hooks/useDownloadedAweme'
import type { LoadMoreOutcome } from '../hooks/useAwemeList'
import type { DouyinAweme, DouyinDownloadedEntry, DouyinListKind } from '../types'

interface AwemePanelProps {
  kind: DouyinListKind
  cookie: string
  items: DouyinAweme[]
  loading: boolean
  error: string | null
  hasMore: boolean
  downloadedById: Map<string, DouyinDownloadedEntry>
  onRetry: () => void
  onLoadMore: () => Promise<LoadMoreOutcome>
  onDownloaded: (entry: DouyinDownloadedEntry) => void
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
  cookie,
  items,
  loading,
  error,
  hasMore,
  downloadedById,
  onRetry,
  onLoadMore,
  onDownloaded,
  onBatchActiveChange,
}: AwemePanelProps) {
  const { toast } = useToast()
  const [selected, setSelected] = useState<DouyinAweme | null>(null)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [lastPath, setLastPath] = useState<string | null>(null)
  const [previewSrc, setPreviewSrc] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)

  const batch = useBatchDownload({
    cookie,
    kind,
    items,
    hasMore,
    downloadedById,
    loadMore: onLoadMore,
    onDownloaded,
  })

  useEffect(() => {
    onBatchActiveChange?.(batch.isActive)
  }, [batch.isActive, onBatchActiveChange])

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
          cookie,
          awemeId: selected.awemeId,
          playUrl: selected.playUrl,
        })
        // blob URL：WKWebView 下 convertFileSrc(asset://) 经常无法播放本地 mp4
        const bytes = await readFile(path)
        if (cancelled) return
        const blob = new Blob([bytes], { type: 'video/mp4' })
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
  }, [selected, cookie])

  useEffect(() => {
    if (!selected) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelected(null)
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [selected])

  const handleDownload = async (item: DouyinAweme) => {
    if (downloadedById.has(item.awemeId) || downloadingId || batch.isActive) return
    setDownloadingId(item.awemeId)
    try {
      const result = await downloadAweme({
        cookie,
        awemeId: item.awemeId,
        playUrl: item.playUrl,
        title: item.desc || item.awemeId,
        kind,
      })
      setLastPath(result.path)
      onDownloaded({
        awemeId: item.awemeId,
        kind: kindFolder(kind),
        path: result.path,
        title: item.desc || item.awemeId,
        downloadedAt: Math.floor(Date.now() / 1000),
      })
      toast(`已下载到 downloads/抖音/${kindFolder(kind)}`, 'success')
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'danger')
    } finally {
      setDownloadingId(null)
    }
  }

  const selectedDownloaded = selected ? downloadedById.get(selected.awemeId) : undefined
  const scrollRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const rowRefs = useRef(new Map<string, HTMLTableRowElement>())
  const onLoadMoreRef = useRef(onLoadMore)
  onLoadMoreRef.current = onLoadMore

  useEffect(() => {
    if (!batch.activeId) return
    const row = rowRefs.current.get(batch.activeId)
    const root = scrollRef.current
    if (!row || !root) return
    const rowTop = row.offsetTop
    const rowBottom = rowTop + row.offsetHeight
    const viewTop = root.scrollTop
    const viewBottom = viewTop + root.clientHeight
    const margin = 48
    if (rowTop < viewTop + margin) {
      root.scrollTo({ top: Math.max(0, rowTop - margin), behavior: 'smooth' })
    } else if (rowBottom > viewBottom - margin) {
      root.scrollTo({
        top: rowBottom - root.clientHeight + margin,
        behavior: 'smooth',
      })
    }
  }, [batch.activeId, batch.phase, items.length])

  useEffect(() => {
    if (batch.isActive && selected) setSelected(null)
  }, [batch.isActive, selected])

  useEffect(() => {
    const root = scrollRef.current
    const sentinel = sentinelRef.current
    if (!root || !sentinel || !hasMore || loading || batch.isActive) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) void onLoadMoreRef.current()
      },
      { root, rootMargin: '120px 0px', threshold: 0 },
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasMore, loading, items.length, batch.isActive])

  const pendingCount = items.filter((item) => !downloadedById.has(item.awemeId)).length
  const busySingle = downloadingId !== null
  const controlsLocked = batch.isActive || busySingle

  const handleBatchClick = () => {
    if (batch.isActive) {
      batch.stop()
      return
    }
    if (pendingCount === 0 && !hasMore) {
      toast('当前没有可下载的视频', 'neutral')
      return
    }
    batch.clearStopBanner()
    void batch.start()
  }

  return (
    <>
      <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-border-subtle bg-surface/60">
        <header className="shrink-0 border-b border-border-subtle px-4 py-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">
                {kind === 'favorite' ? '喜欢' : '作品'}
              </p>
              <p className="mt-0.5 text-[11px] text-subtle">
                {items.length} 条已加载
                {pendingCount > 0 ? ` · ${pendingCount} 条未下载` : ''}
                {' · '}
                点击条目预览
              </p>
            </div>
            <button
              type="button"
              disabled={busySingle || (pendingCount === 0 && !hasMore && !batch.isActive)}
              onClick={handleBatchClick}
              className={`inline-flex h-8 items-center gap-1.5 rounded-xl border px-3 text-[11px] transition-colors ${
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
                  : '停止批量'
                : kind === 'favorite'
                  ? '一键下载喜欢'
                  : '一键下载作品'}
            </button>
          </div>

          {(batch.isActive || batch.statusText) && (
            <p className="mt-2 text-[11px] text-muted">
              {batch.statusText || '批量进行中…'}
              <span className="text-subtle">
                {' '}
                · 成功 {batch.successCount}
                {' · '}
                加载更多 {batch.loadMoreUsed}/{batch.maxLoadMore}
              </span>
            </p>
          )}

          {batch.stopMessage && !batch.isActive && (
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
        </header>

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
            <table className="w-full table-fixed text-left text-xs">
              <colgroup>
                <col style={{ width: '3.25rem' }} />
                <col />
                <col style={{ width: '5.5rem' }} />
                <col style={{ width: '4.5rem' }} />
                <col style={{ width: '4rem' }} />
                <col style={{ width: '9.5rem' }} />
              </colgroup>
              <thead className="sticky top-0 z-10 bg-surface/95 backdrop-blur-sm">
                <tr className="border-b border-border-subtle text-[10px] uppercase tracking-wider text-subtle">
                  <th className="px-3 py-2 font-medium">封面</th>
                  <th className="px-2 py-2 font-medium">内容</th>
                  <th className="px-2 py-2 font-medium">作者</th>
                  <th className="px-2 py-2 text-right font-medium">点赞</th>
                  <th className="px-2 py-2 text-right font-medium">时长</th>
                  <th className="px-3 py-2 text-right font-medium">嗅探</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => {
                  const downloaded = downloadedById.get(item.awemeId)
                  const busy = downloadingId === item.awemeId || batch.activeId === item.awemeId
                  const isBatchTarget = batch.activeId === item.awemeId
                  return (
                    <tr
                      key={item.awemeId}
                      ref={(el) => {
                        if (el) rowRefs.current.set(item.awemeId, el)
                        else rowRefs.current.delete(item.awemeId)
                      }}
                      onClick={() => {
                        if (!batch.isActive) setSelected(item)
                      }}
                      className={`border-b border-border-subtle/60 transition-colors duration-200 ${
                        batch.isActive ? 'cursor-default' : 'cursor-pointer hover:bg-surface-hover/50'
                      } ${isBatchTarget ? 'bg-surface-hover/70' : ''}`}
                    >
                      <td className="px-3 py-2.5">
                        {item.coverUrl ? (
                          <img
                            src={item.coverUrl}
                            alt=""
                            className="h-10 w-8 rounded-md object-cover"
                            loading="lazy"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <div className="h-10 w-8 rounded-md bg-surface-hover" />
                        )}
                      </td>
                      <td className="min-w-0 px-2 py-2.5">
                        <p className="line-clamp-2 font-medium text-foreground">
                          {item.desc || `未命名 ${index + 1}`}
                        </p>
                      </td>
                      <td className="truncate px-2 py-2.5 text-muted">
                        {item.authorName || '—'}
                      </td>
                      <td className="px-2 py-2.5 text-right tabular-nums text-subtle">
                        {formatCount(item.diggCount)}
                      </td>
                      <td className="px-2 py-2.5 text-right tabular-nums text-subtle">
                        {formatDuration(item.durationMs)}
                      </td>
                      <td
                        className="px-3 py-2.5 text-right"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-end gap-1">
                          {downloaded ? (
                            <>
                              <span
                                className="inline-flex items-center gap-1 px-1.5 text-[11px] text-success"
                                title={downloaded.path}
                              >
                                <FontAwesomeIcon icon={faCircleCheck} className="h-3 w-3" />
                                已下载
                              </span>
                              <button
                                type="button"
                                onClick={() => void revealItemInDir(downloaded.path)}
                                className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-muted transition-colors hover:bg-background hover:text-foreground"
                                title="打开文件位置"
                                aria-label="打开文件位置"
                              >
                                <FontAwesomeIcon icon={faFolderOpen} className="h-3 w-3" />
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              disabled={controlsLocked}
                              onClick={() => void handleDownload(item)}
                              aria-busy={busy}
                              className={`inline-flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-[11px] transition-colors duration-200 ${
                                busy
                                  ? 'cursor-wait text-foreground'
                                  : 'text-muted hover:bg-background hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40'
                              }`}
                            >
                              <FontAwesomeIcon
                                icon={busy ? faSpinner : faSatelliteDish}
                                className={`h-3 w-3 ${busy ? 'animate-spin' : ''}`}
                              />
                              {busy ? '下载中' : '下载'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}

          {items.length > 0 && (
            <div ref={sentinelRef} className="flex h-10 items-center justify-center">
              {hasMore ? (
                <p className="flex items-center gap-1.5 text-[11px] text-subtle">
                  {(loading || batch.phase === 'loadingMore') && (
                    <FontAwesomeIcon icon={faSpinner} className="h-2.5 w-2.5 animate-spin" />
                  )}
                  {batch.phase === 'loadingMore'
                    ? `批量加载更多 ${batch.loadMoreUsed + 1}/${batch.maxLoadMore}…`
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
                  className="absolute inset-0 bg-black/55"
                  onClick={() => setSelected(null)}
                />
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
                          onClick={() =>
                            void revealItemInDir(lastPath || selectedDownloaded!.path)
                          }
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
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  )
}
