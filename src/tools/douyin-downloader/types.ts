export type AuthStatus =
  | 'anonymous'
  | 'logging-in'
  | 'authenticated'
  | 'auth-error'

export type DouyinListKind = 'post' | 'favorite'

export interface DouyinProfile {
  secUid: string
  uid: string
  nickname: string
  avatarUrl: string
}

export interface DouyinAweme {
  awemeId: string
  desc: string
  coverUrl: string
  playUrl: string
  durationMs: number
  diggCount: number
  createTime: number
  authorName: string
}

export interface DouyinListResult {
  items: DouyinAweme[]
  maxCursor: number
  hasMore: boolean
}

export interface DouyinDownloadResult {
  path: string
  awemeId: string
}

export interface DouyinDownloadedEntry {
  awemeId: string
  kind: string
  path: string
  title: string
  downloadedAt: number
}

export interface DouyinQrSession {
  token: string
  qrUrl: string
}

export interface DouyinQrPollResult {
  status: string
  cookie: string | null
  message: string | null
}
