import { useCallback, useState } from 'react'
import { useResyncWhenVisible } from '@/shell/useResyncWhenVisible'
import {
  listDownloadedBilibili,
  type BiliDownloadedEntry,
} from '../api/bilibiliApi'

function sameByBvid(
  prev: Map<string, BiliDownloadedEntry>,
  next: Map<string, BiliDownloadedEntry>,
) {
  if (prev.size !== next.size) return false
  for (const [id, entry] of next) {
    const old = prev.get(id)
    if (!old || old.path !== entry.path || old.songId !== entry.songId) return false
  }
  return true
}

export function useDownloadedByBvid() {
  const [byBvid, setByBvid] = useState<Map<string, BiliDownloadedEntry>>(() => new Map())

  const reload = useCallback(async () => {
    try {
      const entries = await listDownloadedBilibili()
      const next = new Map<string, BiliDownloadedEntry>()
      for (const entry of entries) {
        next.set(entry.bvid, entry)
      }
      setByBvid((prev) => (sameByBvid(prev, next) ? prev : next))
    } catch {
      setByBvid((prev) => (prev.size === 0 ? prev : new Map()))
    }
  }, [])

  useResyncWhenVisible(reload)

  const markDownloaded = useCallback((entry: BiliDownloadedEntry) => {
    setByBvid((prev) => {
      const next = new Map(prev)
      next.set(entry.bvid, entry)
      return next
    })
  }, [])

  return { byBvid, reload, markDownloaded }
}
