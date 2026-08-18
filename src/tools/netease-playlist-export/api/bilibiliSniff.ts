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

export interface BiliDownloadRequest {
  bvid: string
  songId: number
  playlistId?: number
  playlistName?: string
  preferredTitle?: string
  artists?: string
  playlistIndex?: number
  playlistTotal?: number
}

export interface BiliSearchPage {
  items: BiliSearchItem[]
  page: number
  hasMore: boolean
}

export async function searchBilibili(
  keyword: string,
  durationMs?: number,
  page = 1,
): Promise<BiliSearchPage> {
  return invoke<BiliSearchPage>('bilibili_search', {
    keyword,
    durationMs: durationMs ?? null,
    page,
  })
}

export async function downloadBilibili(
  req: BiliDownloadRequest,
): Promise<BiliDownloadResult> {
  return invoke<BiliDownloadResult>('bilibili_download', {
    bvid: req.bvid,
    songId: req.songId,
    playlistId: req.playlistId ?? null,
    playlistName: req.playlistName ?? null,
    preferredTitle: req.preferredTitle ?? null,
    artists: req.artists ?? null,
    playlistIndex: req.playlistIndex ?? null,
    playlistTotal: req.playlistTotal ?? null,
  })
}

export async function listDownloadedBilibili(): Promise<BiliDownloadedEntry[]> {
  return invoke<BiliDownloadedEntry[]>('bilibili_list_downloaded')
}

export async function applyPlaylistTrackSeq(
  playlistId: number,
  songIds: number[],
): Promise<{ renamed: number; skipped: number }> {
  return invoke('bilibili_apply_track_seq', { playlistId, songIds })
}
