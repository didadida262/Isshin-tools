import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { readFile } from '@tauri-apps/plugin-fs'
import { useVirtualizer } from '@tanstack/react-virtual'
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
  faRotateRight,
  faEllipsis,
  faTrashCan,
} from '@fortawesome/free-solid-svg-icons'
import { AnimatePresence, motion } from 'framer-motion'
import gsap from 'gsap'
import { ErrorState } from '@/components/ErrorState'
import { TrackListSkeleton } from '@/components/Skeleton'
import { useToast } from '@/components/Toast'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { useToolVisible } from '@/shell/ToolVisibility'
import {
  clearPlayerSession,
  getPlayerPlayback,
  setPlayerSession,
  usePlayerSource,
  type AudioSnapshot,
} from '@/player'
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
import { TrackPreviewDialog } from './TrackPreviewDialog'
import { releaseBlobUrl } from '@/lib/mediaBlob'

const TRACK_ROW_HEIGHT = 52
const TRACK_GRID =
  '3rem minmax(0, 1.6fr) minmax(0, 0.7fr) 3.5rem 7.25rem'

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
  const toolVisible = useToolVisible()
  const [filter, setFilter] = useState('')
  const [exporting, setExporting] = useState<ExportFormat | null>(null)
  const [lastPath, setLastPath] = useState<string | null>(null)
  const [sniffTrack, setSniffTrack] = useState<NeteaseTrack | null>(null)
  const [previewTrack, setPreviewTrack] = useState<NeteaseTrack | null>(null)
  const [previewMinimized, setPreviewMinimized] = useState(false)
  const [previewSrc, setPreviewSrc] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const dockResumeRef = useRef<number>(0)
  const [dialogResume, setDialogResume] = useState<AudioSnapshot | null>(null)
  const [batchActive, setBatchActive] = useState(false)
  const [batchStopping, setBatchStopping] = useState(false)
  const [batchSongId, setBatchSongId] = useState<number | null>(null)
  const [batchSuccess, setBatchSuccess] = useState(0)
  const [batchStatus, setBatchStatus] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [deletingSongId, setDeletingSongId] = useState<number | null>(null)
  const exportBtnRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const cancelBatchRef = useRef(false)
  const previewTrackRef = useRef<NeteaseTrack | null>(null)
  const filteredRef = useRef<NeteaseTrack[]>([])
  const { bySongId, markDownloaded, deleteDownloaded, reload, syncing, syncFromDisk } =
    useDownloadedTracks()
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
  filteredRef.current = filtered
  previewTrackRef.current = previewTrack

  const rowVirtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => TRACK_ROW_HEIGHT,
    overscan: 12,
    getItemKey: (index) => filtered[index]?.songId ?? index,
  })
  const virtualizerRef = useRef(rowVirtualizer)
  virtualizerRef.current = rowVirtualizer

  const scrollToSongId = useCallback((songId: number) => {
    const index = filteredRef.current.findIndex((t) => t.songId === songId)
    if (index < 0) return
    virtualizerRef.current.scrollToIndex(index, { align: 'auto', behavior: 'smooth' })
  }, [])

  const playerSource = usePlayerSource()

  const previewIndex = previewTrack
    ? filtered.findIndex((t) => t.songId === previewTrack.songId)
    : -1
  const previewDownloaded = previewTrack
    ? bySongId.get(previewTrack.songId)
    : undefined

  const closePreview = useCallback(() => {
    setPreviewTrack(null)
    setPreviewMinimized(false)
    if (playerSource === 'netease') clearPlayerSession()
  }, [playerSource])

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
    scrollToSongId(batchSongId)
  }, [batchSongId, sniffTrack, scrollToSongId])

  useEffect(() => {
    cancelBatchRef.current = true
    setBatchActive(false)
    setBatchStopping(false)
    setBatchSongId(null)
    setBatchStatus(null)
    setSniffTrack(null)
    setPreviewTrack(null)
    setPreviewMinimized(false)
    setMenuOpen(false)
    setDeletingSongId(null)
    appliedSeqKey.current = ''
    dismissTask(TASK_IDS.neteaseBatch)
    registerCancelHandler(TASK_IDS.neteaseBatch, null)
  }, [playlist?.id])

  useEffect(() => {
    if (!previewTrack) {
      setPreviewSrc((prev) => {
        releaseBlobUrl(prev)
        return null
      })
      setPreviewError(null)
      setPreviewLoading(false)
      return
    }

    const entry = bySongIdRef.current.get(previewTrack.songId)
    if (!entry) {
      setPreviewSrc((prev) => {
        releaseBlobUrl(prev)
        return null
      })
      setPreviewLoading(false)
      setPreviewError('尚未下载本地文件，请先嗅探下载')
      return
    }

    let cancelled = false
    setPreviewLoading(true)
    setPreviewError(null)

    void (async () => {
      let created: string | null = null
      try {
        const bytes = await readFile(entry.path)
        if (cancelled) return
        const lower = entry.path.toLowerCase()
        const mime = lower.endsWith('.m4a')
          ? 'audio/mp4'
          : lower.endsWith('.mp3')
            ? 'audio/mpeg'
            : 'audio/mp4'
        const blob = new Blob([bytes], { type: mime })
        created = URL.createObjectURL(blob)
        if (cancelled) {
          releaseBlobUrl(created)
          return
        }
        setPreviewSrc((prev) => {
          if (prev && prev !== created) releaseBlobUrl(prev)
          return created
        })
      } catch (e) {
        if (created) releaseBlobUrl(created)
        if (cancelled) return
        setPreviewError(e instanceof Error ? e.message : String(e))
      } finally {
        if (!cancelled) setPreviewLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [previewTrack])

  const scrollPreviewIntoView = useCallback((songId: number) => {
    scrollToSongId(songId)
  }, [scrollToSongId])

  /** Prev/next only land on locally downloaded tracks (skip undownloaded). */
  const goPreviewOffset = useCallback(
    (delta: number) => {
      const list = filteredRef.current
      const currentId = previewTrackRef.current?.songId
      const index = currentId
        ? list.findIndex((item) => item.songId === currentId)
        : -1
      if (index < 0) return

      let nextIndex = index + delta
      while (nextIndex >= 0 && nextIndex < list.length) {
        const candidate = list[nextIndex]
        if (candidate && bySongIdRef.current.has(candidate.songId)) {
          setDialogResume(null)
          setPreviewTrack(candidate)
          scrollPreviewIntoView(candidate.songId)
          return
        }
        nextIndex += delta
      }
    },
    [scrollPreviewIntoView],
  )

  const hasDownloadedNeighbor = useCallback(
    (fromIndex: number, delta: number) => {
      let i = fromIndex + delta
      while (i >= 0 && i < filtered.length) {
        const t = filtered[i]
        if (t && bySongId.has(t.songId)) return true
        i += delta
      }
      return false
    },
    [filtered, bySongId],
  )

  const previewHasPrev = previewIndex >= 0 && hasDownloadedNeighbor(previewIndex, -1)
  const previewHasNext = previewIndex >= 0 && hasDownloadedNeighbor(previewIndex, 1)

  useEffect(() => {
    if (!previewTrack) {
      if (playerSource === 'netease') clearPlayerSession()
      return
    }

    // Expanded dialog owns local audio — bottom mini player must stay gone.
    if (!previewMinimized) {
      clearPlayerSession()
      return
    }

    const list = filteredRef.current
    const index = list.findIndex((t) => t.songId === previewTrack.songId)
    const resumeAt = dockResumeRef.current
    dockResumeRef.current = 0
    setPlayerSession(
      {
        source: 'netease',
        toolId: 'netease-playlist-export',
        track: {
          id: String(previewTrack.songId),
          title: previewTrack.name || '未命名歌曲',
          subtitle: previewTrack.artists || '未知歌手',
          coverUrl: playlist?.coverImgUrl ?? null,
          durationMs: previewTrack.durationMs,
        },
        src: previewSrc,
        loading: previewLoading,
        error: previewError,
        minimized: true,
        resumeAt: resumeAt > 0 ? resumeAt : undefined,
        hasPrev: (() => {
          for (let i = index - 1; i >= 0; i -= 1) {
            const t = list[i]
            if (t && bySongIdRef.current.has(t.songId)) return true
          }
          return false
        })(),
        hasNext: (() => {
          for (let i = index + 1; i < list.length; i += 1) {
            const t = list[i]
            if (t && bySongIdRef.current.has(t.songId)) return true
          }
          return false
        })(),
      },
      {
        onPrev: () => goPreviewOffset(-1),
        onNext: () => goPreviewOffset(1),
        onEnded: () => goPreviewOffset(1),
        onExpand: () => {
          const pb = getPlayerPlayback()
          setDialogResume({
            current: pb.current,
            duration: pb.duration,
            playing: pb.playing,
          })
          setPreviewMinimized(false)
        },
        onClose: () => {
          setPreviewTrack(null)
          setPreviewMinimized(false)
          setDialogResume(null)
        },
      },
    )
  }, [
    previewTrack,
    previewSrc,
    previewLoading,
    previewError,
    previewMinimized,
    playlist?.coverImgUrl,
    playerSource,
    goPreviewOffset,
  ])

  useEffect(() => {
    if (playerSource && playerSource !== 'netease' && previewTrack) {
      setPreviewTrack(null)
      setPreviewMinimized(false)
    }
  }, [playerSource, previewTrack])

  useEffect(() => {
    if (!previewTrack) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (previewMinimized) {
          const pb = getPlayerPlayback()
          setDialogResume({
            current: pb.current,
            duration: pb.duration,
            playing: pb.playing,
          })
          setPreviewMinimized(false)
        } else {
          closePreview()
        }
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
    if (!previewMinimized) document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [previewTrack, previewMinimized, goPreviewOffset, closePreview])

  useEffect(() => {
    if (batchActive && previewTrack) closePreview()
  }, [batchActive, previewTrack, closePreview])

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

  useEffect(() => {
    if (!menuOpen) return
    const onPointerDown = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

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

  const handleSyncStatus = async () => {
    if (batchActive || syncing || exporting !== null) return
    try {
      const result = await syncFromDisk()
      const parts: string[] = []
      if (result.added > 0) parts.push(`新增 ${result.added}`)
      if (result.removed > 0) parts.push(`移除 ${result.removed}`)
      if (result.updated > 0) parts.push(`更新 ${result.updated}`)
      const summary =
        parts.length > 0
          ? parts.join(' · ')
          : `无变化 · 共 ${result.entries.length} 首`
      toast(`状态已同步 · ${summary}`, 'success')
      if (result.skipped > 0) {
        toast(
          `有 ${result.skipped} 个文件无法识别（需保留 歌曲ID 与 BV 号命名）`,
          'neutral',
        )
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      toast(`状态同步失败：${message}`, 'danger')
    }
  }

  const handleDeleteLocal = async (track: NeteaseTrack) => {
    if (batchActive || syncing || deletingSongId != null) return
    const entry = bySongId.get(track.songId)
    if (!entry) return
    setDeletingSongId(track.songId)
    try {
      await deleteDownloaded(track.songId)
      if (lastPath === entry.path) setLastPath(null)
      if (previewTrackRef.current?.songId === track.songId) {
        closePreview()
      }
      toast(`已删除本地文件 · ${track.name}`, 'success')
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      toast(`删除失败：${message}`, 'danger')
    } finally {
      setDeletingSongId(null)
    }
  }

  const openPreview = useCallback(
    (track: NeteaseTrack) => {
      if (batchActive) return
      // Only locally downloaded tracks can open the player.
      if (!bySongIdRef.current.has(track.songId)) return
      clearPlayerSession()
      setDialogResume(null)
      setPreviewMinimized(false)
      setPreviewTrack(track)
    },
    [batchActive],
  )

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
          <div ref={menuRef} className="relative shrink-0">
            <div ref={exportBtnRef}>
              <button
                type="button"
                aria-label="歌单操作"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                disabled={!playlist}
                onClick={() => setMenuOpen((open) => !open)}
                className={`relative inline-flex h-8 w-8 items-center justify-center rounded-xl text-muted transition-colors duration-200 hover:bg-surface-hover hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 ${
                  menuOpen ? 'bg-surface-hover text-foreground' : ''
                } ${batchActive ? 'text-danger hover:text-danger' : ''}`}
              >
                <FontAwesomeIcon icon={faEllipsis} className="h-3.5 w-3.5" />
                {batchActive && (
                  <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-danger" />
                )}
              </button>
            </div>
            {menuOpen && playlist && (
              <div
                role="menu"
                className="absolute top-full right-0 z-20 mt-1.5 w-44 overflow-hidden rounded-xl border border-border bg-surface py-1 shadow-xl"
              >
                <button
                  type="button"
                  role="menuitem"
                  disabled={
                    tracks.length === 0 ||
                    exporting !== null ||
                    syncing ||
                    (!batchActive && pendingCount === 0)
                  }
                  onClick={() => {
                    setMenuOpen(false)
                    handleBatchClick()
                  }}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                    batchActive
                      ? 'text-danger hover:bg-danger/10'
                      : 'text-foreground hover:bg-surface-hover'
                  }`}
                >
                  <FontAwesomeIcon
                    icon={batchActive ? (batchStopping ? faSpinner : faStop) : faLayerGroup}
                    className={`h-3 w-3 shrink-0 ${batchStopping ? 'animate-spin' : ''}`}
                  />
                  {batchActive
                    ? batchStopping
                      ? '正在停止'
                      : '停止批量'
                    : '一键嗅探下载'}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  disabled={exporting !== null || batchActive || syncing}
                  title="扫描 downloads/网易云音乐/旅途图262喜欢的音乐，按本地文件同步已下载状态"
                  onClick={() => {
                    setMenuOpen(false)
                    void handleSyncStatus()
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-foreground transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <FontAwesomeIcon
                    icon={syncing ? faSpinner : faRotateRight}
                    className={`h-3 w-3 shrink-0 ${syncing ? 'animate-spin' : ''}`}
                  />
                  {syncing ? '同步中' : '状态同步'}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  disabled={
                    tracks.length === 0 ||
                    exporting !== null ||
                    batchActive ||
                    syncing
                  }
                  onClick={() => {
                    setMenuOpen(false)
                    void handleExport('json')
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-foreground transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <FontAwesomeIcon
                    icon={exporting === 'json' ? faSpinner : faFileCode}
                    className={`h-3 w-3 shrink-0 ${exporting === 'json' ? 'animate-spin' : ''}`}
                  />
                  导出 JSON
                </button>
                <button
                  type="button"
                  role="menuitem"
                  disabled={
                    tracks.length === 0 ||
                    exporting !== null ||
                    batchActive ||
                    syncing
                  }
                  onClick={() => {
                    setMenuOpen(false)
                    void handleExport('csv')
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-foreground transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <FontAwesomeIcon
                    icon={exporting === 'csv' ? faSpinner : faTable}
                    className={`h-3 w-3 shrink-0 ${exporting === 'csv' ? 'animate-spin' : ''}`}
                  />
                  导出 CSV
                </button>
              </div>
            )}
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
          <div className="min-w-0">
            <div
              role="row"
              className="sticky top-0 z-10 grid items-center border-b border-border-subtle bg-surface/95 px-0 text-[10px] uppercase tracking-wider text-subtle backdrop-blur-sm"
              style={{ gridTemplateColumns: TRACK_GRID }}
            >
              <div className="px-3 py-2 font-medium">#</div>
              <div className="px-2 py-2 font-medium">歌曲</div>
              <div className="truncate px-2 py-2 font-medium">专辑</div>
              <div className="px-3 py-2 text-right font-medium">时长</div>
              <div className="px-2 py-2 text-center font-medium">嗅探</div>
            </div>
            <div
              role="rowgroup"
              className="relative w-full"
              style={{ height: rowVirtualizer.getTotalSize() }}
            >
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const track = filtered[virtualRow.index]
                if (!track) return null
                const downloaded = bySongId.get(track.songId)
                const canPreview = !!downloaded
                const isBatchTarget = batchSongId === track.songId
                const isPreviewing = previewTrack?.songId === track.songId
                return (
                  <div
                    key={track.songId}
                    role="row"
                    onClick={() => {
                      if (canPreview) openPreview(track)
                    }}
                    title={canPreview ? undefined : '请先嗅探下载到本地后再播放'}
                    aria-disabled={!canPreview}
                    className={`absolute top-0 left-0 grid w-full items-center border-b border-border-subtle/60 transition-colors duration-150 ${
                      canPreview
                        ? `cursor-pointer ${
                            isPreviewing || isBatchTarget
                              ? 'bg-surface-hover/70'
                              : 'hover:bg-surface-hover/50'
                          }`
                        : 'cursor-not-allowed opacity-55'
                    }`}
                    style={{
                      height: virtualRow.size,
                      transform: `translateY(${virtualRow.start}px)`,
                      gridTemplateColumns: TRACK_GRID,
                    }}
                  >
                    <div className="px-3 py-2.5 text-xs tabular-nums text-subtle">
                      {seqBySongId.get(track.songId) ?? virtualRow.index + 1}
                    </div>
                    <div className="min-w-0 overflow-hidden px-2 py-2.5">
                      <div className="flex min-w-0 items-start gap-1.5">
                        <div className="min-w-0 flex-1 overflow-hidden">
                          <p className="truncate text-xs font-medium text-foreground" title={track.name}>
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
                    </div>
                    <div
                      className="min-w-0 overflow-hidden truncate px-2 py-2.5 text-xs text-muted"
                      title={track.album || undefined}
                    >
                      {track.album || '—'}
                    </div>
                    <div className="px-3 py-2.5 text-right text-xs tabular-nums text-subtle">
                      {formatDuration(track.durationMs)}
                    </div>
                    <div className="px-2 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-center gap-0.5">
                        <button
                          type="button"
                          disabled={batchActive}
                          onClick={() => setSniffTrack(track)}
                          className={`inline-flex h-6 w-6 items-center justify-center rounded-md transition-colors duration-200 hover:bg-background disabled:cursor-not-allowed disabled:opacity-40 ${
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
                            className={`!h-3 !w-3 ${isBatchTarget && batchActive ? 'animate-spin' : ''}`}
                          />
                        </button>
                        {downloaded && (
                          <>
                            <button
                              type="button"
                              onClick={() => void revealExport(downloaded.path)}
                              className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted transition-colors duration-200 hover:bg-background hover:text-foreground"
                              title="打开文件位置"
                              aria-label={`打开 ${track.name} 所在文件夹`}
                            >
                              <FontAwesomeIcon icon={faFolderOpen} className="!h-3 !w-3" />
                            </button>
                            <button
                              type="button"
                              disabled={batchActive || syncing || deletingSongId != null}
                              onClick={() => void handleDeleteLocal(track)}
                              className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted transition-colors duration-200 hover:bg-background hover:text-danger disabled:cursor-not-allowed disabled:opacity-40"
                              title="删除本地文件"
                              aria-label={`删除 ${track.name} 的本地文件`}
                            >
                              <FontAwesomeIcon
                                icon={deletingSongId === track.songId ? faSpinner : faTrashCan}
                                className={`!h-3 !w-3 ${deletingSongId === track.songId ? 'animate-spin' : ''}`}
                              />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
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

      {typeof document !== 'undefined' &&
        toolVisible &&
        createPortal(
          <AnimatePresence mode="sync">
            {previewTrack && !previewMinimized && (
              <motion.div
                key="preview-overlay"
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
                  onClick={closePreview}
                />
                <TrackPreviewDialog
                  track={previewTrack}
                  coverUrl={playlist?.coverImgUrl}
                  src={previewSrc}
                  previewLoading={previewLoading}
                  previewError={previewError}
                  downloaded={previewDownloaded}
                  canReveal={!!previewDownloaded?.path}
                  resume={dialogResume}
                  hasPrev={previewHasPrev}
                  hasNext={previewHasNext}
                  onMinimize={(snap) => {
                    dockResumeRef.current = snap.current
                    setDialogResume(null)
                    setPreviewMinimized(true)
                  }}
                  onClose={closePreview}
                  onPrev={() => goPreviewOffset(-1)}
                  onNext={() => goPreviewOffset(1)}
                  onEnded={() => goPreviewOffset(1)}
                  onReveal={() => {
                    if (previewDownloaded?.path) void revealExport(previewDownloaded.path)
                  }}
                  onSniff={() => {
                    setSniffTrack(previewTrack)
                    closePreview()
                  }}
                />
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </section>
  )
}
