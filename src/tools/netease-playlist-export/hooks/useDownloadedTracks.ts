import { useCallback, useEffect, useState } from 'react'
import {
  listDownloadedBilibili,
  type BiliDownloadedEntry,
} from '../api/bilibiliSniff'

export function useDownloadedTracks() {
  const [bySongId, setBySongId] = useState<Map<number, BiliDownloadedEntry>>(
    () => new Map(),
  )
  const [loading, setLoading] = useState(false)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const entries = await listDownloadedBilibili()
      const next = new Map<number, BiliDownloadedEntry>()
      for (const entry of entries) {
        next.set(entry.songId, entry)
      }
      setBySongId(next)
    } catch {
      // 索引缺失或首次使用时忽略
      setBySongId(new Map())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const markDownloaded = useCallback((entry: BiliDownloadedEntry) => {
    setBySongId((prev) => {
      const next = new Map(prev)
      next.set(entry.songId, entry)
      return next
    })
  }, [])

  return { bySongId, loading, reload, markDownloaded }
}
