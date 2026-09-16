import { useEffect, useRef, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faBackwardStep,
  faForwardStep,
  faPause,
  faPlay,
  faSpinner,
  faUpRightAndDownLeftFromCenter,
  faXmark,
} from '@fortawesome/free-solid-svg-icons'
import {
  patchPlayerPlayback,
  playerClose,
  playerExpand,
  playerNext,
  playerEnded,
  playerPrev,
  playerSeek,
  playerToggle,
  registerPlayerAudioBridge,
  usePlayerSession,
  usePlayerPlayback,
} from './playerStore'

function formatClock(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const total = Math.floor(seconds)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

/**
 * Shell-level audio host + NetEase-style bottom mini bar.
 * Survives tool switches; tools only swap session resources via playerStore.
 */
export function GlobalMiniPlayer() {
  const session = usePlayerSession()
  const playback = usePlayerPlayback()
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const progressFillRef = useRef<HTMLDivElement | null>(null)
  const timeLabelRef = useRef<HTMLSpanElement | null>(null)
  const mobileRangeRef = useRef<HTMLInputElement | null>(null)
  const [seeking, setSeeking] = useState(false)
  const seekingRef = useRef(false)
  const lastTimeEmitRef = useRef(0)
  const durationRef = useRef(0)

  seekingRef.current = seeking
  durationRef.current = playback.duration

  useEffect(() => {
    registerPlayerAudioBridge({
      toggle: () => {
        const audio = audioRef.current
        if (!audio) return
        if (audio.paused) {
          void audio.play().catch(() => patchPlayerPlayback({ playing: false }))
        } else {
          audio.pause()
        }
      },
      seek: (seconds) => {
        const audio = audioRef.current
        if (!audio) return
        audio.currentTime = seconds
        patchPlayerPlayback({ current: seconds })
        paintProgress(seconds)
      },
    })
    return () => registerPlayerAudioBridge(null)
  }, [])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    if (!session?.src) {
      audio.removeAttribute('src')
      delete audio.dataset.playerSrc
      audio.load()
      return
    }
    if (audio.dataset.playerSrc === session.src) return
    audio.dataset.playerSrc = session.src
    audio.src = session.src
    void audio.play().catch(() => patchPlayerPlayback({ playing: false }))
  }, [session?.src])

  const paintProgress = (seconds: number) => {
    const dur = durationRef.current
    const pct = dur > 0 ? Math.min(100, (seconds / dur) * 100) : 0
    if (progressFillRef.current) {
      progressFillRef.current.style.width = `${pct}%`
    }
    if (timeLabelRef.current) {
      timeLabelRef.current.textContent = formatClock(seconds)
    }
    if (mobileRangeRef.current && !seekingRef.current) {
      mobileRangeRef.current.value = String(Math.min(seconds, dur || 0))
      mobileRangeRef.current.style.background = `linear-gradient(to right, #ec4141 ${pct}%, rgba(255,255,255,0.15) ${pct}%)`
    }
  }

  useEffect(() => {
    if (!seeking) paintProgress(playback.current)
  }, [playback.current, seeking])

  const canControl = !!session && !session.loading && !session.error && !!session.src
  const showBar = !!session?.minimized

  return (
    <>
      <audio
        ref={audioRef}
        preload="auto"
        onPlay={() => patchPlayerPlayback({ playing: true })}
        onPause={() => patchPlayerPlayback({ playing: false })}
        onEnded={() => {
          patchPlayerPlayback({ playing: false })
          playerEnded()
        }}
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration
          if (Number.isFinite(d) && d > 0) patchPlayerPlayback({ duration: d })
        }}
        onTimeUpdate={(e) => {
          const t = e.currentTarget.currentTime
          if (!seekingRef.current) paintProgress(t)
          const now = performance.now()
          // Rare store publishes — only for expanded dialogs; panels don't subscribe.
          if (now - lastTimeEmitRef.current < 500) return
          lastTimeEmitRef.current = now
          patchPlayerPlayback({ current: t })
        }}
        className="hidden"
      />

      {showBar && session && (
        <div
          key="global-mini-player"
          role="complementary"
          aria-label="迷你播放器"
          className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] animate-[mini-player-in_0.2s_ease-out]"
        >
          <div className="pointer-events-auto border-t border-white/10 bg-[#16181c]/95 shadow-[0_-8px_40px_rgba(0,0,0,0.45)]">
            <div className="absolute inset-x-0 top-0 h-0.5 bg-white/10">
              <div
                ref={progressFillRef}
                className="h-full bg-[#ec4141]"
                style={{
                  width: `${
                    playback.duration > 0
                      ? Math.min(100, (playback.current / playback.duration) * 100)
                      : 0
                  }%`,
                }}
              />
            </div>

            <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-3 md:gap-4 md:px-5">
              <button
                type="button"
                onClick={() => playerExpand()}
                title="展开播放页"
                className="group flex min-w-0 flex-1 items-center gap-3 text-left"
              >
                <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-md bg-white/10 ring-1 ring-white/10">
                  {session.track.coverUrl ? (
                    <img
                      src={session.track.coverUrl}
                      alt=""
                      className="h-full w-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <FontAwesomeIcon icon={faPlay} className="h-3 w-3 text-white/40" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-white">
                    {session.track.title || '未命名'}
                  </p>
                  <p className="truncate text-[11px] text-white/45">
                    {session.track.subtitle || '未知'}
                  </p>
                </div>
                <FontAwesomeIcon
                  icon={faUpRightAndDownLeftFromCenter}
                  className="hidden h-3 w-3 shrink-0 text-white/35 group-hover:text-white/70 sm:block"
                />
              </button>

              <div className="flex shrink-0 items-center gap-1 sm:gap-2">
                <button
                  type="button"
                  disabled={!session.hasPrev}
                  onClick={() => playerPrev()}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-25"
                  aria-label="上一首"
                >
                  <FontAwesomeIcon icon={faBackwardStep} className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  disabled={!canControl}
                  onClick={() => playerToggle()}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white text-[#16181c] transition-transform hover:scale-[1.04] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label={playback.playing ? '暂停' : '播放'}
                >
                  {session.loading ? (
                    <FontAwesomeIcon icon={faSpinner} className="h-4 w-4 animate-spin" />
                  ) : (
                    <FontAwesomeIcon
                      icon={playback.playing ? faPause : faPlay}
                      className={`h-4 w-4 ${playback.playing ? '' : 'translate-x-0.5'}`}
                    />
                  )}
                </button>
                <button
                  type="button"
                  disabled={!session.hasNext}
                  onClick={() => playerNext()}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-25"
                  aria-label="下一首"
                >
                  <FontAwesomeIcon icon={faForwardStep} className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="hidden min-w-30 shrink-0 items-center justify-end gap-2 text-[10px] tabular-nums text-white/40 md:flex">
                <span ref={timeLabelRef}>{formatClock(playback.current)}</span>
                <span className="text-white/20">/</span>
                <span>{formatClock(playback.duration)}</span>
              </div>

              <button
                type="button"
                onClick={() => playerClose()}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/40 transition-colors hover:bg-white/10 hover:text-white"
                aria-label="关闭播放"
                title="关闭"
              >
                <FontAwesomeIcon icon={faXmark} className="h-3.5 w-3.5" />
              </button>
            </div>

            {canControl && (
              <div className="px-3 pb-2 md:hidden">
                <input
                  ref={mobileRangeRef}
                  key={session.track.id}
                  type="range"
                  min={0}
                  max={playback.duration || 1}
                  step={0.05}
                  defaultValue={Math.min(playback.current, playback.duration || 0)}
                  onMouseDown={() => setSeeking(true)}
                  onTouchStart={() => setSeeking(true)}
                  onChange={(e) => {
                    const v = Number(e.target.value)
                    const dur = durationRef.current
                    const pct = dur > 0 ? Math.min(100, (v / dur) * 100) : 0
                    e.target.style.background = `linear-gradient(to right, #ec4141 ${pct}%, rgba(255,255,255,0.15) ${pct}%)`
                  }}
                  onMouseUp={(e) => {
                    playerSeek(Number((e.target as HTMLInputElement).value))
                    setSeeking(false)
                  }}
                  onTouchEnd={(e) => {
                    playerSeek(Number((e.target as HTMLInputElement).value))
                    setSeeking(false)
                  }}
                  className="music-seek h-1 w-full cursor-pointer appearance-none rounded-full bg-white/15"
                  aria-label="播放进度"
                />
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
