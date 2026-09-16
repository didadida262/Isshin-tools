import { useEffect, useRef, useState } from 'react'

import { getPlayMode } from './playerStore'

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

  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !enabled) return

    if (!src) {
      audio.removeAttribute('src')
      delete audio.dataset.localSrc
      audio.load()
      setPlaying(false)
      setCurrent(0)
      return
    }

    if (audio.dataset.localSrc === src) return
    audio.dataset.localSrc = src
    audio.src = src

    const resume = resumeRef.current
    const start = () => {
      if (resume && resume.current > 0) {
        audio.currentTime = resume.current
        setCurrent(resume.current)
      }
      if (!resume || resume.playing) {
        void audio.play().catch(() => setPlaying(false))
      }
      resumeRef.current = null
    }

    if (audio.readyState >= 1) start()
    else {
      const onMeta = () => start()
      audio.addEventListener('loadedmetadata', onMeta, { once: true })
      return () => audio.removeEventListener('loadedmetadata', onMeta)
    }
  }, [src, enabled])

  const toggle = () => {
    const audio = audioRef.current
    if (!audio) return
    if (audio.paused) void audio.play().catch(() => setPlaying(false))
    else audio.pause()
  }

  const seek = (seconds: number) => {
    const audio = audioRef.current
    if (!audio) return
    audio.currentTime = seconds
    setCurrent(seconds)
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
          audio.currentTime = 0
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
