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
  songId: number
}

export interface BiliDownloadedEntry {
  songId: number
  playlistId: number | null
  playlistName: string | null
  path: string
  bvid: string
  title: string
  artists: string | null
  downloadedAt: number
}

/** 用 bvid 生成稳定伪 songId，复用现有 bilibili_download 索引 */
export function bvidToSongId(bvid: string): number {
  let h = 2166136261
  for (let i = 0; i < bvid.length; i++) {
    h ^= bvid.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0) || 1
}

export async function searchBilibili(
  keyword: string,
  page = 1,
): Promise<{ items: BiliSearchItem[]; page: number; hasMore: boolean }> {
  return invoke('bilibili_search', {
    keyword,
    durationMs: null,
    page,
  })
}

export async function downloadBilibiliVideo(params: {
  bvid: string
  title: string
  author: string
}): Promise<BiliDownloadResult> {
  return invoke<BiliDownloadResult>('bilibili_download', {
    bvid: params.bvid,
    songId: bvidToSongId(params.bvid),
    playlistId: null,
    playlistName: 'B站',
    preferredTitle: params.title,
    artists: params.author,
    playlistIndex: null,
    playlistTotal: null,
  })
}

export async function listDownloadedBilibili(): Promise<BiliDownloadedEntry[]> {
  return invoke<BiliDownloadedEntry[]>('bilibili_list_downloaded')
}
