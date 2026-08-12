import { invoke } from '@tauri-apps/api/core'
import type {
  DouyinDownloadResult,
  DouyinDownloadedEntry,
  DouyinListKind,
  DouyinListResult,
  DouyinProfile,
  DouyinQrPollResult,
  DouyinQrSession,
} from '../types'

export async function loginWithCookie(cookie: string) {
  return invoke<DouyinProfile>('douyin_login_cookie', { cookie })
}

export async function startQrLogin() {
  return invoke<DouyinQrSession>('douyin_qr_start')
}

export async function pollQrLogin(token: string) {
  return invoke<DouyinQrPollResult>('douyin_qr_poll', { token })
}

export async function listAweme(
  cookie: string,
  secUid: string,
  kind: DouyinListKind,
  cursor?: number,
) {
  return invoke<DouyinListResult>('douyin_list_aweme', {
    cookie,
    secUid,
    kind,
    cursor: cursor ?? null,
  })
}

export async function downloadAweme(params: {
  cookie: string
  awemeId: string
  playUrl: string
  title?: string
  kind?: DouyinListKind
}) {
  return invoke<DouyinDownloadResult>('douyin_download', {
    cookie: params.cookie,
    awemeId: params.awemeId,
    playUrl: params.playUrl,
    title: params.title ?? null,
    kind: params.kind ?? null,
  })
}

export async function listDownloaded() {
  return invoke<DouyinDownloadedEntry[]>('douyin_list_downloaded')
}

export async function cachePreview(params: {
  cookie: string
  awemeId: string
  playUrl: string
}) {
  return invoke<string>('douyin_cache_preview', {
    cookie: params.cookie,
    awemeId: params.awemeId,
    playUrl: params.playUrl,
  })
}
