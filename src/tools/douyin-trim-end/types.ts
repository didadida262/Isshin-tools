export interface VideoEntry {
  path: string
  name: string
}

export interface TrimResult {
  path: string
  name: string
  outputPath: string | null
  ok: boolean
  error: string | null
  durationBefore: number | null
  durationAfter: number | null
}

export type ItemStatus = 'pending' | 'running' | 'done' | 'error'

export interface TrimQueueItem {
  entry: VideoEntry
  status: ItemStatus
  result?: TrimResult
}

export const DEFAULT_TRIM_SECONDS = 3
