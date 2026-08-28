import type { DouyinAweme } from '../types'

/**
 * Douyin likes/works API returns newest first (top of UI).
 * Numbering matches NetEase liked playlists: earliest (bottom) → 1.
 */
export function chronologicalAwemeIds(items: DouyinAweme[]): string[] {
  return [...items].reverse().map((item) => item.awemeId)
}

/** 1-based seq for an item when the full list is loaded; undefined if not in list. */
export function awemeSeq(
  items: DouyinAweme[],
  awemeId: string,
): { seq: number; total: number } | undefined {
  const index = items.findIndex((item) => item.awemeId === awemeId)
  if (index < 0 || items.length === 0) return undefined
  return { seq: items.length - index, total: items.length }
}
