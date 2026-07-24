export interface NeteaseUserProfile {
  userId: number
  nickname: string
  avatarUrl: string
}

export interface NeteasePlaylist {
  id: number
  name: string
  coverImgUrl: string
  trackCount: number
  playCount: number
  creatorNickname: string
  specialType: number
}

export interface NeteaseTrack {
  songId: number
  name: string
  artists: string
  album: string
  albumId: number
  durationMs: number
}

export interface ExportTrackRow {
  songId: number
  name: string
  artists: string
  album: string
  albumId: number
  durationMs: number
  playlistId: number
  playlistName: string
  exportedAt: string
}

export type ExportFormat = 'json' | 'csv'

export type AuthStatus =
  | 'anonymous'
  | 'logging-in'
  | 'authenticated'
  | 'auth-error'

export interface QrLoginSession {
  uniKey: string
  qrUrl: string
}
