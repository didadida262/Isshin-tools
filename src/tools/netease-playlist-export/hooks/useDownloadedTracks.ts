import { useCallback, useRef, useState } from 'react'
import { useResyncWhenVisible } from '@/shell/useResyncWhenVisible'
import {
  listDownloadedBilibili,
  type BiliDownloadedEntry,
} from '../api/bilibiliSniff'

function sameBySongId(
  prev: Map<number, BiliDownloadedEntry>,
  next: Map<number, BiliDownloadedEntry>,
) {
  if (prev.size !== next.size) return false
  for (const [id, entry] of next) {
    const old = prev.get(id)
    if (!old || old.path !== entry.path || old.bvid !== entry.bvid) return false
  }
  return true
}

export function useDownloadedTracks() {
  const [bySongId, setBySongId] = useState<Map<number, BiliDownloadedEntry>>(
    () => new Map(),
  )
  const [loading, setLoading] = useState(false)
  const loadedOnce = useRef(false)

  const reload = useCallback(async () => {
    if (!loadedOnce.current) setLoading(true)
    try {
      const entries = await listDownloadedBilibili()
      const next = new Map<number, BiliDownloadedEntry>()
      for (const entry of entries) {
        next.set(entry.songId, entry)
      }
      setBySongId((prev) => (sameBySongId(prev, next) ? prev : next))
    } catch {
      // 索引缺失或首次使用时忽略
      setBySongId((prev) => (prev.size === 0 ? prev : new Map()))
    } finally {
      loadedOnce.current = true
      setLoading(false)
    }
  }, [])

  useResyncWhenVisible(reload)

  const markDownloaded = useCallback((entry: BiliDownloadedEntry) => {
    setBySongId((prev) => {
      const next = new Map(prev)
      next.set(entry.songId, entry)
      return next
    })
  }, [])

  return { bySongId, loading, reload, markDownloaded }
}
