import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faFileExport,
  faFileCode,
  faTable,
  faMagnifyingGlass,
  faSpinner,
  faFolderOpen,
  faSatelliteDish,
  faCircleCheck,
  faLayerGroup,
  faStop,
} from '@fortawesome/free-solid-svg-icons'
import { motion } from 'framer-motion'
import gsap from 'gsap'
import { ErrorState } from '@/components/ErrorState'
import { TrackListSkeleton } from '@/components/Skeleton'
import { useToast } from '@/components/Toast'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import {
  dismissTask,
  registerCancelHandler,
  TASK_IDS,
  upsertTask,
} from '@/tasks'
import { buildExportRows } from '../export/exportMetadata'
import { exportPlaylistFile, revealExport } from '../export/saveExport'
import { useDownloadedTracks } from '../hooks/useDownloadedTracks'
import {
  displayTracks,
  seqMapBySongId,
} from '../lib/playlistOrder'
import { applyPlaylistTrackSeq } from '../api/bilibiliSniff'
import {
  runAutoSniffDownload,
  type SniffAutoOutcome,
} from '../lib/autoSniffDownload'
import type { ExportFormat, NeteasePlaylist, NeteaseTrack } from '../types'
import { ResourceSniffDialog } from './ResourceSniffDialog'

interface TrackPanelProps {
  playlist: NeteasePlaylist | null
  tracks: NeteaseTrack[]
  loading: boolean
  error: string | null
  onRetry: () => void
}

function formatDuration(ms: number) {
  if (!ms) return '—'
  const total = Math.floor(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function sleep(ms: number, isCancelled: () => boolean) {
  return new Promise<void>((resolve) => {
    const started = Date.now()
    const tick = () => {
      if (isCancelled() || Date.now() - started >= ms) {
        resolve()
        return
      }
      window.setTimeout(tick, 50)
    }
    tick()
  })
}

export function TrackPanel({
  playlist,
  tracks,
  loading,
  error,
  onRetry,
}: TrackPanelProps) {
  const { toast } = useToast()
  const [filter, setFilter] = useState('')
  const [exporting, setExporting] = useState<ExportFormat | null>(null)
  const [lastPath, setLastPath] = useState<string | null>(null)
  const [sniffTrack, setSniffTrack] = useState<NeteaseTrack | null>(null)
  const [batchActive, setBatchActive] = useState(false)
  const [batchStopping, setBatchStopping] = useState(false)
  const [batchSongId, setBatchSongId] = useState<number | null>(null)
  const [batchSuccess, setBatchSuccess] = useState(0)
  const [batchStatus, setBatchStatus] = useState<string | null>(null)
  const exportBtnRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const rowRefs = useRef(new Map<number, HTMLTableRowElement>())
  const cancelBatchRef = useRef(false)
  const { bySongId, markDownloaded, reload } = useDownloadedTracks()
  const bySongIdRef = useRef(bySongId)
  bySongIdRef.current = bySongId
  const appliedSeqKey = useRef('')

  const orderedTracks = useMemo(
    () => displayTracks(playlist, tracks),
    [playlist, tracks],
  )
  const seqBySongId = useMemo(
    () => seqMapBySongId(orderedTracks),
    [orderedTracks],
  )

  const filterQuery = useDebouncedValue(filter, filter.trim() ? 200 : 0)
  const filtered = useMemo(() => {
    const q = filterQuery.trim().toLowerCase()
    if (!q) return orderedTracks
    return orderedTracks.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.artists.toLowerCase().includes(q) ||
        t.album.toLowerCase().includes(q),
    )
  }, [orderedTracks, filterQuery])

  const downloadedCount = useMemo(() => {
    let n = 0
    for (const t of orderedTracks) {
      if (bySongId.has(t.songId)) n += 1
    }
    return n
  }, [orderedTracks, bySongId])

  const pendingCount = useMemo(() => {
    let n = 0
    for (const t of orderedTracks) {
      if (!bySongId.has(t.songId)) n += 1
    }
    return n
  }, [orderedTracks, bySongId])

  const batchIndex = useMemo(() => {
    if (batchSongId == null) return null
    return seqBySongId.get(batchSongId) ?? null
  }, [batchSongId, seqBySongId])

  useEffect(() => {
    if (batchSongId == null) return
    const row = rowRefs.current.get(batchSongId)
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
  }, [batchSongId, sniffTrack])

  useEffect(() => {
    cancelBatchRef.current = true
    setBatchActive(false)
    setBatchStopping(false)
    setBatchSongId(null)
    setBatchStatus(null)
    setSniffTrack(null)
    appliedSeqKey.current = ''
    dismissTask(TASK_IDS.neteaseBatch)
    registerCancelHandler(TASK_IDS.neteaseBatch, null)
  }, [playlist?.id])

  useEffect(() => {
    if (!batchActive && !batchStatus) {
      dismissTask(TASK_IDS.neteaseBatch)
      registerCancelHandler(TASK_IDS.neteaseBatch, null)
      return
    }

    const status = batchActive
      ? batchStopping
        ? 'stopping'
        : 'running'
      : batchStatus?.includes('失败') || batchStatus?.includes('异常')
        ? 'error'
        : batchStatus?.includes('停止')
          ? 'cancelled'
          : 'success'

    const found = batchSongId == null ? undefined : seqBySongId.get(batchSongId)
    upsertTask({
      id: TASK_IDS.neteaseBatch,
      source: 'netease',
      sourceLabel: '网易云音乐下载器',
      title: playlist ? `批量嗅探 · ${playlist.name}` : '批量嗅探下载',
      detail: batchStatus ?? '准备中…',
      status,
      successCount: batchSuccess,
      itemIndex: found,
      itemTotal: orderedTracks.length > 0 ? orderedTracks.length : undefined,
    })
  }, [
    batchActive,
    batchStopping,
    batchStatus,
    batchSuccess,
    batchSongId,
    playlist,
    orderedTracks,
    seqBySongId,
  ])

  const handleExport = async (format: ExportFormat) => {
    if (!playlist || batchActive) return
    setExporting(format)
    try {
      const rows = buildExportRows(playlist, orderedTracks)
      const result = await exportPlaylistFile(rows, playlist.name, format)
      setLastPath(result.path)
      toast(`已导出 ${format.toUpperCase()} · ${rows.length} 首`, 'success')
      if (exportBtnRef.current) {
        gsap.fromTo(
          exportBtnRef.current,
          { scale: 0.98 },
          { scale: 1, duration: 0.35, ease: 'power2.out' },
        )
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : '导出失败'
      if (message !== '已取消导出') {
        toast(message, 'danger')
      }
    } finally {
      setExporting(null)
    }
  }

  const stopBatch = useCallback(() => {
    if (!batchActive) return
    cancelBatchRef.current = true
    setBatchStopping(true)
    setBatchStatus('正在停止…')
  }, [batchActive])

  useEffect(() => {
    registerCancelHandler(TASK_IDS.neteaseBatch, batchActive ? stopBatch : null)
  }, [batchActive, stopBatch])

  useEffect(() => {
    if (!playlist || loading || error || batchActive || orderedTracks.length === 0) return
    const key = `${playlist.id}:${orderedTracks.length}:${orderedTracks[0]?.songId}:${orderedTracks[orderedTracks.length - 1]?.songId}`
    if (appliedSeqKey.current === key) return
    appliedSeqKey.current = key
    void applyPlaylistTrackSeq(
      playlist.id,
      orderedTracks.map((t) => t.songId),
    )
      .then((result) => {
        if (result.renamed > 0) {
          toast(`已按列表序号重命名 ${result.renamed} 个文件`, 'success')
          void reload()
        }
      })
      .catch((e) => {
        appliedSeqKey.current = ''
        const message = e instanceof Error ? e.message : String(e)
        toast(`按序号重命名失败：${message}`, 'danger')
      })
  }, [
    playlist,
    loading,
    error,
    batchActive,
    orderedTracks,
    reload,
    toast,
  ])

  const startBatch = async () => {
    if (!playlist || batchActive) return
    if (pendingCount === 0) {
      toast('当前歌单没有待下载曲目', 'neutral')
      return
    }

    cancelBatchRef.current = false
    setBatchActive(true)
    setBatchStopping(false)
    setBatchSuccess(0)
    setBatchStatus('准备批量嗅探下载…')

    let localSuccess = 0

    try {
      for (const track of orderedTracks) {
        if (cancelBatchRef.current) break
        if (bySongIdRef.current.has(track.songId)) continue

        setBatchSongId(track.songId)
        setBatchStatus(`嗅探中：${track.name}`)

        const outcome: SniffAutoOutcome = await runAutoSniffDownload({
          track,
          playlist,
          playlistIndex: seqBySongId.get(track.songId),
          playlistTotal: orderedTracks.length,
          isCancelled: () => cancelBatchRef.current,
          onStatus: setBatchStatus,
        })
        if (cancelBatchRef.current || outcome.status === 'aborted') break

        if (outcome.status === 'downloaded') {
          markDownloaded(outcome.entry)
          bySongIdRef.current = new Map(bySongIdRef.current).set(
            outcome.entry.songId,
            outcome.entry,
          )
          localSuccess += 1
          setBatchSuccess(localSuccess)
          setLastPath(outcome.entry.path)
          setBatchStatus(`已下载：${track.name}`)
        } else if (outcome.status === 'empty') {
          setBatchStatus(`无可下载资源，跳过：${track.name}`)
        } else if (outcome.status === 'error') {
          setBatchActive(false)
          setBatchStopping(false)
          setBatchSongId(null)
          setBatchStatus(`批量下载已停止：${outcome.message}`)
          toast(`批量下载已停止：${outcome.message}`, 'danger')
          return
        }

        await sleep(350, () => cancelBatchRef.current)
      }

      setBatchSongId(null)
      setBatchActive(false)
      setBatchStopping(false)
      if (cancelBatchRef.current) {
        setBatchStatus(`已手动停止（成功 ${localSuccess} 首）`)
        toast(`已停止批量下载 · 成功 ${localSuccess} 首`, 'neutral')
      } else {
        setBatchStatus(
          localSuccess > 0
            ? `本轮完成，成功下载 ${localSuccess} 首`
            : '没有可下载的新曲目',
        )
        toast(
          localSuccess > 0
            ? `批量完成 · 成功 ${localSuccess} 首`
            : '没有可下载的新曲目',
          localSuccess > 0 ? 'success' : 'neutral',
        )
      }
    } catch (e) {
      setBatchSongId(null)
      setBatchActive(false)
      setBatchStopping(false)
      const message = e instanceof Error ? e.message : String(e)
      setBatchStatus(`批量异常：${message}`)
      toast(message, 'danger')
    }
  }

  const handleBatchClick = () => {
    if (batchActive) {
      stopBatch()
      return
    }
    void startBatch()
  }

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-border-subtle bg-surface/60">
      <header className="shrink-0 border-b border-border-subtle px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-medium text-foreground">
              {playlist?.name ?? '歌曲'}
            </h3>
            <p className="mt-0.5 text-[11px] text-subtle">
              {playlist
                ? `${tracks.length} 首 · 元数据导出 / B站资源嗅探${
                    downloadedCount > 0 ? ` · 已下载 ${downloadedCount}` : ''
                  }${pendingCount > 0 ? ` · ${pendingCount} 首未下载` : ''}`
                : '选择左侧歌单查看曲目'}
            </p>
          </div>
          <div ref={exportBtnRef} className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={
                !playlist ||
                tracks.length === 0 ||
                exporting !== null ||
                (!batchActive && pendingCount === 0)
              }
              onClick={handleBatchClick}
              className={`inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-xl border px-2.5 text-xs transition-all duration-200 ${
                batchActive
                  ? 'border-danger/35 bg-danger/10 text-danger hover:bg-danger/15'
                  : 'border-border bg-background text-foreground hover:border-muted hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-40'
              }`}
            >
              <FontAwesomeIcon
                icon={batchActive ? (batchStopping ? faSpinner : faStop) : faLayerGroup}
                className={`h-3 w-3 ${batchStopping ? 'animate-spin' : ''}`}
              />
              {batchActive
                ? batchStopping
                  ? '正在停止'
                  : '停止批量'
                : '一键嗅探下载'}
            </button>
            <ExportButton
              label="JSON"
              icon={faFileCode}
              disabled={!playlist || tracks.length === 0 || exporting !== null || batchActive}
              loading={exporting === 'json'}
              onClick={() => void handleExport('json')}
            />
            <ExportButton
              label="CSV"
              icon={faTable}
              disabled={!playlist || tracks.length === 0 || exporting !== null || batchActive}
              loading={exporting === 'csv'}
              onClick={() => void handleExport('csv')}
            />
          </div>
        </div>

        {(batchActive || batchStatus) && (
          <p className="mt-2 text-[11px] text-muted">
            {batchIndex != null && (
              <span className="tabular-nums text-subtle">#{batchIndex} · </span>
            )}
            {batchStatus || '批量进行中…'}
            {batchActive && (
              <span className="text-subtle"> · 成功 {batchSuccess}</span>
            )}
          </p>
        )}

        {playlist && (
          <div className="relative mt-2.5">
            <FontAwesomeIcon
              icon={faMagnifyingGlass}
              className="pointer-events-none absolute top-1/2 left-2.5 h-3 w-3 -translate-y-1/2 text-subtle"
            />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="过滤歌曲 / 歌手 / 专辑"
              aria-label="过滤歌曲"
              disabled={batchActive}
              className="w-full rounded-xl border border-border bg-background py-1.5 pr-3 pl-8 text-xs text-foreground outline-none transition-all duration-200 placeholder:text-subtle focus:border-muted disabled:opacity-50"
            />
          </div>
        )}

        {lastPath && (
          <button
            type="button"
            onClick={() => void revealExport(lastPath)}
            className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-muted transition-colors duration-200 hover:text-foreground"
          >
            <FontAwesomeIcon icon={faFolderOpen} className="h-3 w-3" />
            打开所在目录
          </button>
        )}
      </header>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
        {!playlist && (
          <div className="flex h-full items-center justify-center px-6 py-16">
            <div className="text-center">
              <FontAwesomeIcon
                icon={faFileExport}
                className="mb-3 h-5 w-5 text-subtle"
              />
              <p className="text-xs text-muted">选择歌单后可预览并导出元数据</p>
            </div>
          </div>
        )}
        {playlist && loading && <TrackListSkeleton />}
        {playlist && !loading && error && (
          <ErrorState message={error} onRetry={onRetry} title="歌曲加载失败" />
        )}
        {playlist && !loading && !error && filtered.length === 0 && (
          <p className="px-4 py-10 text-center text-xs text-muted">没有匹配的歌曲</p>
        )}
        {playlist && !loading && !error && filtered.length > 0 && (
          <table className="w-full table-fixed text-left text-xs">
            <colgroup>
              <col style={{ width: '3rem' }} />
              <col style={{ width: '46%' }} />
              <col style={{ width: '18%' }} />
              <col style={{ width: '3.5rem' }} />
              <col style={{ width: '5.5rem' }} />
            </colgroup>
            <thead className="sticky top-0 z-10 bg-surface/95 backdrop-blur-sm">
              <tr className="border-b border-border-subtle text-[10px] uppercase tracking-wider text-subtle">
                <th className="px-3 py-2 font-medium">#</th>
                <th className="px-2 py-2 font-medium">歌曲</th>
                <th className="truncate px-2 py-2 font-medium">专辑</th>
                <th className="px-3 py-2 text-right font-medium">时长</th>
                <th className="px-2 py-2 text-center font-medium">嗅探</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((track, index) => {
                const downloaded = bySongId.get(track.songId)
                const isBatchTarget = batchSongId === track.songId
                return (
                  <motion.tr
                    key={track.songId}
                    ref={(el) => {
                      if (el) rowRefs.current.set(track.songId, el)
                      else rowRefs.current.delete(track.songId)
                    }}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: Math.min(index * 0.008, 0.15) }}
                    className={`border-b border-border-subtle/60 transition-colors duration-200 ${
                      isBatchTarget
                        ? 'bg-surface-hover/70'
                        : 'hover:bg-surface-hover/50'
                    }`}
                  >
                    <td className="px-3 py-2.5 tabular-nums text-subtle">
                      {seqBySongId.get(track.songId) ?? index + 1}
                    </td>
                    <td className="min-w-0 overflow-hidden px-2 py-2.5">
                      <div className="flex min-w-0 items-start gap-1.5">
                        <div className="min-w-0 flex-1 overflow-hidden">
                          <p className="truncate font-medium text-foreground" title={track.name}>
                            {track.name}
                          </p>
                          <p
                            className="mt-0.5 truncate text-[11px] text-subtle"
                            title={track.artists || '未知歌手'}
                          >
                            {track.artists || '未知歌手'}
                          </p>
                        </div>
                        {downloaded && (
                          <span
                            className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-md bg-success/15 px-1.5 py-0.5 text-[10px] font-medium text-success"
                            title={downloaded.path}
                          >
                            <FontAwesomeIcon icon={faCircleCheck} className="h-2.5 w-2.5" />
                            已下载
                          </span>
                        )}
                      </div>
                    </td>
                    <td
                      className="min-w-0 overflow-hidden truncate px-2 py-2.5 text-muted"
                      title={track.album || undefined}
                    >
                      {track.album || '—'}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-subtle">
                      {formatDuration(track.durationMs)}
                    </td>
                    <td className="px-2 py-2.5">
                      <div className="flex items-center justify-center gap-0.5">
                        <button
                          type="button"
                          disabled={batchActive}
                          onClick={() => setSniffTrack(track)}
                          className={`inline-flex h-7 w-7 items-center justify-center rounded-lg text-[11px] transition-colors duration-200 hover:bg-background disabled:cursor-not-allowed disabled:opacity-40 ${
                            downloaded
                              ? 'text-success hover:text-success'
                              : isBatchTarget
                                ? 'text-foreground'
                                : 'text-muted hover:text-foreground'
                          }`}
                          title={downloaded ? `已下载 · ${downloaded.path}` : '资源嗅探'}
                          aria-label={`嗅探 ${track.name}`}
                        >
                          <FontAwesomeIcon
                            icon={isBatchTarget && batchActive ? faSpinner : faSatelliteDish}
                            className={`h-3 w-3 ${isBatchTarget && batchActive ? 'animate-spin' : ''}`}
                          />
                        </button>
                        {downloaded && (
                          <button
                            type="button"
                            onClick={() => void revealExport(downloaded.path)}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-muted transition-colors duration-200 hover:bg-background hover:text-foreground"
                            title="打开文件位置"
                            aria-label={`打开 ${track.name} 所在文件夹`}
                          >
                            <FontAwesomeIcon icon={faFolderOpen} className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </td>
                  </motion.tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      <ResourceSniffDialog
        open={sniffTrack !== null}
        track={sniffTrack}
        playlist={playlist}
        playlistIndex={sniffTrack ? seqBySongId.get(sniffTrack.songId) : undefined}
        playlistTotal={orderedTracks.length}
        downloadedEntry={sniffTrack ? bySongId.get(sniffTrack.songId) ?? null : null}
        onClose={() => setSniffTrack(null)}
        onDownloaded={markDownloaded}
      />
    </section>
  )
}

function ExportButton({
  label,
  icon,
  disabled,
  loading,
  onClick,
}: {
  label: string
  icon: typeof faFileCode
  disabled: boolean
  loading: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-background px-2.5 py-1.5 text-xs text-foreground transition-all duration-200 ease-in-out hover:border-muted hover:bg-surface-hover hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-40"
    >
      <FontAwesomeIcon
        icon={loading ? faSpinner : icon}
        className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`}
      />
      {label}
    </button>
  )
}
