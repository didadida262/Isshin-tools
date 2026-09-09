import { invoke } from '@tauri-apps/api/core'
import type {
  DouyinDownloadResult,
  DouyinDownloadedEntry,
  DouyinListKind,
  DouyinListResult,
  DouyinProfile,
} from '../types'

/** Bring up the Douyin window so the user can sign in there. */
export async function openLoginWindow() {
  return invoke<void>('douyin_open_login')
}

export async function hideLoginWindow() {
  return invoke<void>('douyin_hide_login')
}

export async function logout() {
  return invoke<void>('douyin_logout')
}

/** Resolves only when the Douyin window holds a signed-in session. */
export async function fetchProfile() {
  return invoke<DouyinProfile>('douyin_profile')
}

export async function listAweme(
  secUid: string,
  kind: DouyinListKind,
  cursor?: number,
) {
  return invoke<DouyinListResult>('douyin_list_aweme', {
    secUid,
    kind,
    cursor: cursor ?? null,
  })
}

export async function unlikeAweme(awemeId: string) {
  return invoke<void>('douyin_unlike', { awemeId })
}

export async function downloadAweme(params: {
  awemeId: string
  playUrl: string
  playUrls?: string[]
  title?: string
  kind?: DouyinListKind
  /** 1-based chronological seq (oldest = 1); omit until list is fully loaded */
  seq?: number
  total?: number
}) {
  return invoke<DouyinDownloadResult>('douyin_download', {
    awemeId: params.awemeId,
    playUrl: params.playUrl,
    playUrls: params.playUrls ?? null,
    title: params.title ?? null,
    kind: params.kind ?? null,
    seq: params.seq ?? null,
    total: params.total ?? null,
  })
}

export async function listDownloaded() {
  return invoke<DouyinDownloadedEntry[]>('douyin_list_downloaded')
}

/** Rename downloaded files to `{seq}_{awemeId}_{stem}.mp4`. Pass IDs oldest-first. */
export async function applyAwemeSeq(kind: DouyinListKind, awemeIds: string[]) {
  return invoke<{ renamed: number; skipped: number }>('douyin_apply_aweme_seq', {
    kind,
    awemeIds,
  })
}

export async function cachePreview(params: {
  awemeId: string
  playUrl: string
  playUrls?: string[]
  kind?: DouyinListKind
}) {
  return invoke<string>('douyin_cache_preview', {
    awemeId: params.awemeId,
    playUrl: params.playUrl,
    playUrls: params.playUrls ?? null,
    kind: params.kind ?? null,
  })
}
