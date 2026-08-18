import { useCallback, useEffect, useState } from 'react'
import {
  listDownloadedBilibili,
  type BiliDownloadedEntry,
} from '../api/bilibiliApi'

export function useDownloadedByBvid() {
  const [byBvid, setByBvid] = useState<Map<string, BiliDownloadedEntry>>(() => new Map())

  const reload = useCallback(async () => {
    try {
      const entries = await listDownloadedBilibili()
      const next = new Map<string, BiliDownloadedEntry>()
      for (const entry of entries) {
        next.set(entry.bvid, entry)
      }
      setByBvid(next)
    } catch {
      setByBvid(new Map())
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const markDownloaded = useCallback((entry: BiliDownloadedEntry) => {
    setByBvid((prev) => {
      const next = new Map(prev)
      next.set(entry.bvid, entry)
      return next
    })
  }, [])

  return { byBvid, reload, markDownloaded }
}
