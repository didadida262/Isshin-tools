import { useSyncExternalStore } from 'react'

export type PlayerSource = 'netease' | 'douyin'

export type PlayerTrackMeta = {
  id: string
  title: string
  subtitle: string
  coverUrl?: string | null
  durationMs?: number
}

export type PlayerSession = {
  source: PlayerSource
  /** toolsRegistry id — used to jump back on expand */
  toolId: string
  track: PlayerTrackMeta
  src: string | null
  loading: boolean
  error: string | null
  minimized: boolean
  hasPrev: boolean
  hasNext: boolean
}

export type PlayerPlayback = {
  playing: boolean
  current: number
  duration: number
}

export type PlayerHandlers = {
  onPrev: () => void
  onNext: () => void
  /** Fired when a track ends; defaults to onNext */
  onEnded?: () => void
  onExpand: () => void
  onClose: () => void
}

const sessionListeners = new Set<() => void>()
const playbackListeners = new Set<() => void>()

let session: PlayerSession | null = null
let playback: PlayerPlayback = { playing: false, current: 0, duration: 0 }
let handlers: PlayerHandlers | null = null
let navigateToTool: ((toolId: string) => void) | null = null

/** Stable snapshots for useSyncExternalStore */
let sessionSnap: PlayerSession | null = null
let sourceSnap: PlayerSource | null = null
let playbackSnap: PlayerPlayback = playback

type AudioBridge = {
  toggle: () => void
  seek: (seconds: number) => void
}
let audioBridge: AudioBridge | null = null

function publishSession() {
  sessionSnap = session
  sourceSnap = session?.source ?? null
  sessionListeners.forEach((listener) => listener())
}

function publishPlayback() {
  playbackSnap = playback
  playbackListeners.forEach((listener) => listener())
}

export function subscribePlayerSession(listener: () => void) {
  sessionListeners.add(listener)
  return () => {
    sessionListeners.delete(listener)
  }
}

export function subscribePlayerPlayback(listener: () => void) {
  playbackListeners.add(listener)
  return () => {
    playbackListeners.delete(listener)
  }
}

export function getPlayerSession() {
  return sessionSnap
}

export function getPlayerSource() {
  return sourceSnap
}

export function getPlayerPlayback() {
  return playbackSnap
}

/** Full session — for GlobalMiniPlayer chrome. */
export function usePlayerSession() {
  return useSyncExternalStore(
    subscribePlayerSession,
    getPlayerSession,
    getPlayerSession,
  )
}

/** Source only — panels can react to takeover without playback churn. */
export function usePlayerSource() {
  return useSyncExternalStore(
    subscribePlayerSession,
    getPlayerSource,
    getPlayerSource,
  )
}

/** Progress / playing — dialogs & mini bar only. */
export function usePlayerPlayback() {
  return useSyncExternalStore(
    subscribePlayerPlayback,
    getPlayerPlayback,
    getPlayerPlayback,
  )
}

/** @deprecated prefer usePlayerSession / usePlayerPlayback */
export function usePlayer() {
  const sessionValue = usePlayerSession()
  const playbackValue = usePlayerPlayback()
  return { session: sessionValue, playback: playbackValue }
}

export function registerPlayerNavigate(fn: ((toolId: string) => void) | null) {
  navigateToTool = fn
}

export function registerPlayerHandlers(next: PlayerHandlers | null) {
  handlers = next
}

export function registerPlayerAudioBridge(bridge: AudioBridge | null) {
  audioBridge = bridge
}

function sessionShallowEqual(a: PlayerSession | null, b: PlayerSession): boolean {
  if (!a) return false
  return (
    a.source === b.source &&
    a.toolId === b.toolId &&
    a.src === b.src &&
    a.loading === b.loading &&
    a.error === b.error &&
    a.minimized === b.minimized &&
    a.hasPrev === b.hasPrev &&
    a.hasNext === b.hasNext &&
    a.track.id === b.track.id &&
    a.track.title === b.track.title &&
    a.track.subtitle === b.track.subtitle &&
    a.track.coverUrl === b.track.coverUrl &&
    a.track.durationMs === b.track.durationMs
  )
}

export function setPlayerSession(
  next: PlayerSession,
  nextHandlers?: PlayerHandlers | null,
) {
  if (nextHandlers !== undefined) handlers = nextHandlers
  if (sessionShallowEqual(session, next)) return

  const prevSrc = session?.src
  session = next
  if (next.src !== prevSrc) {
    playback = {
      playing: false,
      current: 0,
      duration:
        next.track.durationMs && next.track.durationMs > 0
          ? next.track.durationMs / 1000
          : 0,
    }
    publishPlayback()
  }
  publishSession()
}

export function patchPlayerSession(
  patch: Partial<Omit<PlayerSession, 'source' | 'toolId'>> & {
    track?: PlayerTrackMeta
  },
) {
  if (!session) return
  const next = { ...session, ...patch }
  if (sessionShallowEqual(session, next)) return
  session = next
  publishSession()
}

export function setPlayerMinimized(minimized: boolean) {
  if (!session || session.minimized === minimized) return
  session = { ...session, minimized }
  publishSession()
}

export function patchPlayerPlayback(patch: Partial<PlayerPlayback>) {
  const next = { ...playback, ...patch }
  if (
    next.playing === playback.playing &&
    next.current === playback.current &&
    next.duration === playback.duration
  ) {
    return
  }
  playback = next
  publishPlayback()
}

export function clearPlayerSession() {
  if (!session && !handlers) return
  session = null
  handlers = null
  playback = { playing: false, current: 0, duration: 0 }
  publishSession()
  publishPlayback()
}

export function playerToggle() {
  audioBridge?.toggle()
}

export function playerSeek(seconds: number) {
  audioBridge?.seek(seconds)
}

export function playerPrev() {
  handlers?.onPrev()
}

export function playerNext() {
  handlers?.onNext()
}

export function playerEnded() {
  if (handlers?.onEnded) handlers.onEnded()
  else handlers?.onNext()
}

export function playerClose() {
  handlers?.onClose()
  clearPlayerSession()
}

export function playerExpand() {
  if (!session) return
  const toolId = session.toolId
  if (session.minimized) {
    session = { ...session, minimized: false }
    publishSession()
  }
  navigateToTool?.(toolId)
  handlers?.onExpand()
}
