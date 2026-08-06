import { invoke } from '@tauri-apps/api/core'
import type { TrimResult, VideoEntry } from '../types'

export async function scanVideoDir(dir: string): Promise<VideoEntry[]> {
  return invoke<VideoEntry[]>('scan_video_dir', { dir })
}

export async function trimVideoEnd(
  path: string,
  trimSeconds: number,
): Promise<TrimResult> {
  return invoke<TrimResult>('trim_video_end', { path, trimSeconds })
}
