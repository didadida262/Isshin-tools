import { useEffect, useRef, useState } from 'react'
import { getPlayMode } from './playerStore'
import { stopMediaElement } from '@/lib/mediaBlob'

export type AudioSnapshot = {
  current: number
  duration: number
  playing: boolean
}

/**
 * Local audio for expanded preview dialogs.
 * Global mini player is only used after an explicit minimize (dock).
 */
export function useLocalAudio(
  src: string | null,
  opts?: {
    enabled?: boolean
    resume?: AudioSnapshot | null
    onEnded?: () => void
  },
) {
  const enabled = opts?.enabled ?? true
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState(false)
  const [current, setCurrent] = useState(opts?.resume?.current ?? 0)
  const [duration, setDuration] = useState(opts?.resume?.duration ?? 0)
  const resumeRef = useRef(opts?.resume ?? null)
  resumeRef.current = opts?.resume ?? null
  const onEndedRef = useRef(opts?.onEnded)
  onEndedRef.current = opts?.onEnded
  const playGenRef = useRef(0)

  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !enabled) return

    const gen = ++playGenRef.current

    if (!src) {
      stopMediaElement(audio)
      delete audio.dataset.localSrc
      setPlaying(false)
      setCurrent(0)
      return
    }

    if (audio.dataset.localSrc === src) return

    // Stop previous decode pipeline before attaching a new blob URL.
    try {
      audio.pause()
    } catch {
      // ignore
    }

    audio.dataset.localSrc = src
    audio.src = src

    const resume = resumeRef.current
    const start = () => {
      if (gen !== playGenRef.current) return
      if (resume && resume.current > 0) {
        try {
          audio.currentTime = resume.current
          setCurrent(resume.current)
        } catch {
          // ignore seek errors on fresh buffers
        }
      }
      if (!resume || resume.playing !== false) {
        void audio.play().catch(() => {
          if (gen === playGenRef.current) setPlaying(false)
        })
      }
      resumeRef.current = null
    }

    const onCanPlay = () => start()
    audio.addEventListener('canplay', onCanPlay, { once: true })
    // Fallback if canplay already fired / cached
    if (audio.readyState >= 3) start()

    return () => {
      audio.removeEventListener('canplay', onCanPlay)
      try {
        audio.pause()
      } catch {
        // ignore
      }
    }
  }, [src, enabled])

  useEffect(() => {
    return () => {
      stopMediaElement(audioRef.current)
    }
  }, [])

  const toggle = () => {
    const audio = audioRef.current
    if (!audio) return
    if (audio.paused) void audio.play().catch(() => setPlaying(false))
    else audio.pause()
  }

  const seek = (seconds: number) => {
    const audio = audioRef.current
    if (!audio) return
    try {
      audio.currentTime = seconds
      setCurrent(seconds)
    } catch {
      // ignore
    }
  }

  const snapshot = (): AudioSnapshot => {
    const audio = audioRef.current
    return {
      current: audio?.currentTime ?? current,
      duration: audio?.duration && Number.isFinite(audio.duration) ? audio.duration : duration,
      playing: audio ? !audio.paused : playing,
    }
  }

  const audioEl = (
    <audio
      ref={audioRef}
      preload="auto"
      className="hidden"
      onPlay={() => setPlaying(true)}
      onPause={() => setPlaying(false)}
      onEnded={() => {
        if (getPlayMode() === 'loop-one') {
          const audio = audioRef.current
          if (!audio) return
          try {
            audio.currentTime = 0
          } catch {
            // ignore
          }
          setCurrent(0)
          void audio.play().catch(() => setPlaying(false))
          return
        }
        setPlaying(false)
        onEndedRef.current?.()
      }}
      onLoadedMetadata={(e) => {
        const d = e.currentTarget.duration
        if (Number.isFinite(d) && d > 0) setDuration(d)
      }}
      onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
    />
  )

  return {
    audioEl,
    playing,
    current,
    duration,
    toggle,
    seek,
    snapshot,
  }
}
