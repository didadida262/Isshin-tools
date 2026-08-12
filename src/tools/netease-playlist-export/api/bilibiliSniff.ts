import { invoke } from '@tauri-apps/api/core'

export interface BiliSearchItem {
  bvid: string
  title: string
  author: string
  durationText: string
  durationSec: number
  play: number
  cover: string
  durationDeltaMs: number | null
  url: string
}

export interface BiliDownloadResult {
  path: string
  bvid: string
  title: string
}

export async function searchBilibili(
  keyword: string,
  durationMs?: number,
): Promise<BiliSearchItem[]> {
  return invoke<BiliSearchItem[]>('bilibili_search', {
    keyword,
    durationMs: durationMs ?? null,
  })
}

export async function downloadBilibili(
  bvid: string,
  preferredTitle?: string,
): Promise<BiliDownloadResult> {
  return invoke<BiliDownloadResult>('bilibili_download', {
    bvid,
    preferredTitle: preferredTitle ?? null,
  })
}
