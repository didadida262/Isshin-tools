import { useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faArrowDownShortWide,
  faBackwardStep,
  faCircleCheck,
  faFolderOpen,
  faForwardStep,
  faPause,
  faPlay,
  faRepeat,
  faSatelliteDish,
  faSpinner,
  faWindowMinimize,
  faXmark,
} from '@fortawesome/free-solid-svg-icons'
import { cyclePlayMode, useLocalAudio, usePlayMode, type AudioSnapshot } from '@/player'
import type { BiliDownloadedEntry } from '../api/bilibiliSniff'
import type { NeteaseTrack } from '../types'

function formatClock(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const total = Math.floor(seconds)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export interface TrackPreviewDialogProps {
  track: NeteaseTrack
  coverUrl?: string | null
  src: string | null
  previewLoading: boolean
  previewError: string | null
  downloaded: BiliDownloadedEntry | undefined
  canReveal: boolean
  resume?: AudioSnapshot | null
  onMinimize: (snapshot: AudioSnapshot) => void
  onClose: () => void
  onReveal: () => void
  onSniff: () => void
  onPrev: () => void
  onNext: () => void
  onEnded?: () => void
  hasPrev: boolean
  hasNext: boolean
}

/** Full “Now Playing” modal — owns local audio until user minimizes to the dock. */
export function TrackPreviewDialog({
  track,
  coverUrl,
  src,
  previewLoading,
  previewError,
  downloaded,
  canReveal,
  resume,
  onMinimize,
  onClose,
  onReveal,
  onSniff,
  onPrev,
  onNext,
  onEnded,
  hasPrev,
  hasNext,
}: TrackPreviewDialogProps) {
  const [seeking, setSeeking] = useState(false)
  const [seekValue, setSeekValue] = useState(0)
  const playMode = usePlayMode()
  const { audioEl, playing, current, duration, toggle, seek, snapshot } = useLocalAudio(src, {
    resume,
    onEnded,
  })
  const snapshotRef = useRef(snapshot)
  snapshotRef.current = snapshot

  const displayCurrent = seeking ? seekValue : current
  const displayDuration =
    duration > 0 ? duration : track.durationMs > 0 ? track.durationMs / 1000 : 0
  const progress =
    displayDuration > 0 ? Math.min(1, displayCurrent / displayDuration) : 0
  const canControl = !previewLoading && !previewError && !!src

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-labelledby="track-preview-title"
      initial={{ opacity: 0, y: 14, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 10, scale: 0.98 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
      className="relative z-10 flex h-[min(82vh,560px)] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#0c0d10] shadow-2xl shadow-black/50"
    >
      {audioEl}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {coverUrl ? (
          <>
            <img
              src={coverUrl}
              alt=""
              className="absolute inset-0 h-full w-full scale-125 object-cover opacity-40 blur-3xl"
              referrerPolicy="no-referrer"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-[#0c0d10]/40 via-[#0c0d10]/75 to-[#0c0d10]" />
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(255,255,255,0.12),transparent_55%)]" />
          </>
        ) : (
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_20%,rgba(120,140,180,0.25),transparent_50%),radial-gradient(ellipse_at_80%_80%,rgba(80,100,140,0.2),transparent_45%)]" />
        )}
      </div>

      <div className="relative z-10 flex shrink-0 items-center justify-between px-5 pt-4">
        <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-white/45">
          Now Playing
        </p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onMinimize(snapshotRef.current())}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-white/50 transition-colors hover:bg-white/10 hover:text-white"
            aria-label="最小化到播放栏"
            title="最小化"
          >
            <FontAwesomeIcon icon={faWindowMinimize} className="h-3 w-3 -translate-y-0.5" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-white/50 transition-colors hover:bg-white/10 hover:text-white"
            aria-label="关闭"
          >
            <FontAwesomeIcon icon={faXmark} className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="relative z-10 flex min-h-0 flex-1 flex-col px-6 pb-2 pt-3">
        <div className="flex items-center gap-4">
          <div className="relative shrink-0">
            <div
              className={`relative h-18 w-18 rounded-full border border-white/15 bg-black/40 p-0.75 shadow-[0_0_40px_rgba(0,0,0,0.45)] ${
                playing ? 'music-disc-spin' : ''
              }`}
            >
              {coverUrl ? (
                <img
                  src={coverUrl}
                  alt=""
                  className="h-full w-full rounded-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="h-full w-full rounded-full bg-white/10" />
              )}
              <span className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/30 bg-[#0c0d10]" />
            </div>
            {playing && (
              <span className="absolute -inset-1 rounded-full border border-white/10 opacity-60" />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <h2
              id="track-preview-title"
              className="font-display line-clamp-2 text-lg font-semibold leading-snug tracking-tight text-white"
            >
              {track.name || '未命名歌曲'}
            </h2>
            <p className="mt-1 truncate text-sm text-white/55">
              {track.artists || '未知歌手'}
            </p>
            {track.album ? (
              <p className="mt-0.5 truncate text-[11px] text-white/35">{track.album}</p>
            ) : null}
            <p className="mt-2 text-[10px] tracking-wide text-white/35">
              ↑↓ 切换曲目 · Esc 关闭 · 最小化后加入底栏播放器
            </p>
          </div>
        </div>

        <div className="mt-auto flex flex-col gap-4 pt-8">
          {previewLoading && (
            <p className="flex items-center justify-center gap-2 py-6 text-xs text-white/50">
              <FontAwesomeIcon icon={faSpinner} className="h-3 w-3 animate-spin" />
              加载音轨…
            </p>
          )}
          {!previewLoading && previewError && (
            <p className="px-2 py-6 text-center text-xs text-danger">{previewError}</p>
          )}

          {canControl && (
            <div className="space-y-2">
              <input
                type="range"
                min={0}
                max={displayDuration || 1}
                step={0.05}
                value={Math.min(displayCurrent, displayDuration || 0)}
                onMouseDown={() => {
                  setSeeking(true)
                  setSeekValue(current)
                }}
                onTouchStart={() => {
                  setSeeking(true)
                  setSeekValue(current)
                }}
                onChange={(e) => setSeekValue(Number(e.target.value))}
                onMouseUp={(e) => {
                  seek(Number((e.target as HTMLInputElement).value))
                  setSeeking(false)
                }}
                onTouchEnd={(e) => {
                  seek(Number((e.target as HTMLInputElement).value))
                  setSeeking(false)
                }}
                className="music-seek h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/15"
                style={{
                  background: `linear-gradient(to right, rgba(255,255,255,0.85) ${progress * 100}%, rgba(255,255,255,0.15) ${progress * 100}%)`,
                }}
                aria-label="播放进度"
              />
              <div className="flex justify-between text-[10px] tabular-nums text-white/40">
                <span>{formatClock(displayCurrent)}</span>
                <span>{formatClock(displayDuration)}</span>
              </div>
            </div>
          )}

          {!previewLoading && (
            <div className="flex items-center justify-center gap-5 pb-1">
              <button
                type="button"
                onClick={() => cyclePlayMode()}
                title={playMode === 'loop-one' ? '单曲循环' : '顺序播放'}
                className={`relative inline-flex h-10 w-10 items-center justify-center rounded-full transition-colors hover:bg-white/10 ${
                  playMode === 'loop-one' ? 'text-white' : 'text-white/70 hover:text-white'
                }`}
                aria-label={playMode === 'loop-one' ? '单曲循环' : '顺序播放'}
              >
                {playMode === 'loop-one' ? (
                  <>
                    <FontAwesomeIcon icon={faRepeat} className="h-4 w-4" />
                    <span className="absolute bottom-1.5 right-1.5 text-[9px] font-semibold leading-none">
                      1
                    </span>
                  </>
                ) : (
                  <FontAwesomeIcon icon={faArrowDownShortWide} className="h-4 w-4" />
                )}
              </button>
              <button
                type="button"
                disabled={!hasPrev}
                onClick={onPrev}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-25"
                aria-label="上一首"
                title="上一首（↑）"
              >
                <FontAwesomeIcon icon={faBackwardStep} className="h-4 w-4" />
              </button>
              <button
                type="button"
                disabled={!canControl}
                onClick={toggle}
                className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-white text-[#0c0d10] shadow-[0_8px_30px_rgba(255,255,255,0.18)] transition-transform hover:scale-[1.04] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
                aria-label={playing ? '暂停' : '播放'}
              >
                <FontAwesomeIcon
                  icon={playing ? faPause : faPlay}
                  className={`h-5 w-5 ${playing ? '' : 'translate-x-0.5'}`}
                />
              </button>
              <button
                type="button"
                disabled={!hasNext}
                onClick={onNext}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-25"
                aria-label="下一首"
                title="下一首（↓）"
              >
                <FontAwesomeIcon icon={faForwardStep} className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="relative z-10 flex shrink-0 items-center justify-between gap-3 border-t border-white/8 bg-black/25 px-5 py-3">
        <div className="min-w-0 text-[11px] text-white/40">
          {formatClock(track.durationMs / 1000)}
          {track.album ? (
            <>
              <span className="mx-1.5 text-white/20">·</span>
              <span className="truncate">{track.album}</span>
            </>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {canReveal && (
            <button
              type="button"
              onClick={onReveal}
              className="inline-flex items-center gap-1.5 text-[11px] text-white/45 transition-colors hover:text-white"
            >
              <FontAwesomeIcon icon={faFolderOpen} className="h-3 w-3" />
              打开目录
            </button>
          )}
          {downloaded ? (
            <span className="inline-flex h-8 min-w-21 items-center justify-center gap-1.5 rounded-full bg-success/20 px-3 text-[11px] text-success">
              <FontAwesomeIcon icon={faCircleCheck} className="h-3 w-3" />
              已下载
            </span>
          ) : (
            <button
              type="button"
              onClick={onSniff}
              className="inline-flex h-8 min-w-21 items-center justify-center gap-1.5 rounded-full bg-white/12 px-3 text-[11px] text-white transition-all hover:bg-white/18"
            >
              <FontAwesomeIcon icon={faSatelliteDish} className="h-3 w-3" />
              资源嗅探
            </button>
          )}
        </div>
      </div>
    </motion.div>
  )
}
