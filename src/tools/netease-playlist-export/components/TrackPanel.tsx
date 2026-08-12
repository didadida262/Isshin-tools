import { useMemo, useRef, useState } from 'react'
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
} from '@fortawesome/free-solid-svg-icons'
import { motion } from 'framer-motion'
import gsap from 'gsap'
import { ErrorState } from '@/components/ErrorState'
import { TrackListSkeleton } from '@/components/Skeleton'
import { useToast } from '@/components/Toast'
import { buildExportRows } from '../export/exportMetadata'
import { exportPlaylistFile, revealExport } from '../export/saveExport'
import { useDownloadedTracks } from '../hooks/useDownloadedTracks'
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
  const exportBtnRef = useRef<HTMLDivElement>(null)
  const { bySongId, markDownloaded } = useDownloadedTracks()

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return tracks
    return tracks.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.artists.toLowerCase().includes(q) ||
        t.album.toLowerCase().includes(q),
    )
  }, [tracks, filter])

  const downloadedCount = useMemo(() => {
    let n = 0
    for (const t of tracks) {
      if (bySongId.has(t.songId)) n += 1
    }
    return n
  }, [tracks, bySongId])

  const handleExport = async (format: ExportFormat) => {
    if (!playlist) return
    setExporting(format)
    try {
      const rows = buildExportRows(playlist, tracks)
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
                  }`
                : '选择左侧歌单查看曲目'}
            </p>
          </div>
          <div ref={exportBtnRef} className="flex flex-wrap items-center gap-2">
            <ExportButton
              label="JSON"
              icon={faFileCode}
              disabled={!playlist || tracks.length === 0 || exporting !== null}
              loading={exporting === 'json'}
              onClick={() => void handleExport('json')}
            />
            <ExportButton
              label="CSV"
              icon={faTable}
              disabled={!playlist || tracks.length === 0 || exporting !== null}
              loading={exporting === 'csv'}
              onClick={() => void handleExport('csv')}
            />
          </div>
        </div>

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
              className="w-full rounded-xl border border-border bg-background py-1.5 pr-3 pl-8 text-xs text-foreground outline-none transition-all duration-200 placeholder:text-subtle focus:border-muted"
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

      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
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
              <col style={{ width: '2.5rem' }} />
              <col style={{ width: '28%' }} />
              <col />
              <col style={{ width: '3.5rem' }} />
              <col style={{ width: '6.5rem' }} />
            </colgroup>
            <thead className="sticky top-0 z-10 bg-surface/95 backdrop-blur-sm">
              <tr className="border-b border-border-subtle text-[10px] uppercase tracking-wider text-subtle">
                <th className="px-3 py-2 font-medium">#</th>
                <th className="px-2 py-2 font-medium">歌曲</th>
                <th className="px-2 py-2 font-medium">专辑</th>
                <th className="px-3 py-2 text-right font-medium">时长</th>
                <th className="px-2 py-2 text-center font-medium">嗅探</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((track, index) => {
                const downloaded = bySongId.get(track.songId)
                return (
                  <motion.tr
                    key={track.songId}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: Math.min(index * 0.008, 0.15) }}
                    className="border-b border-border-subtle/60 transition-colors duration-200 hover:bg-surface-hover/50"
                  >
                    <td className="px-3 py-2.5 tabular-nums text-subtle">{index + 1}</td>
                    <td className="min-w-0 px-2 py-2.5">
                      <div className="flex min-w-0 items-start gap-1.5">
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-foreground">{track.name}</p>
                          <p className="mt-0.5 truncate text-[11px] text-subtle">
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
                    <td className="min-w-0 truncate px-2 py-2.5 text-muted">
                      {track.album || '—'}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-subtle">
                      {formatDuration(track.durationMs)}
                    </td>
                    <td className="px-2 py-2.5 text-center">
                      <button
                        type="button"
                        onClick={() => setSniffTrack(track)}
                        className={`inline-flex h-7 items-center justify-center gap-1 rounded-lg px-1.5 text-[11px] transition-colors duration-200 hover:bg-background ${
                          downloaded
                            ? 'text-success hover:text-success'
                            : 'text-muted hover:text-foreground'
                        }`}
                        title={downloaded ? `已下载 · ${downloaded.path}` : '资源嗅探'}
                        aria-label={`嗅探 ${track.name}`}
                      >
                        <FontAwesomeIcon icon={faSatelliteDish} className="h-3 w-3" />
                      </button>
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
