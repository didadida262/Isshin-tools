export type AuthStatus =
  | 'anonymous'
  | 'checking'
  | 'awaiting-login'
  | 'authenticated'
  | 'auth-error'

export type DouyinListKind = 'post' | 'favorite' | 'collect_music'

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
  /** 同一视频的全部 CDN 镜像，主地址在前；单个地址 403/过期时用于回退 */
  playUrlCandidates: string[]
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