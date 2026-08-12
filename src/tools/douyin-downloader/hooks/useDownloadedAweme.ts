import { useCallback, useEffect, useState } from 'react'
import { listDownloaded } from '../api/douyinApi'
import type { DouyinDownloadedEntry } from '../types'

export function useDownloadedAweme() {
  const [byId, setById] = useState<Map<string, DouyinDownloadedEntry>>(() => new Map())

  const reload = useCallback(async () => {
    try {
      const entries = await listDownloaded()
      const next = new Map<string, DouyinDownloadedEntry>()
      for (const entry of entries) next.set(entry.awemeId, entry)
      setById(next)
    } catch {
      setById(new Map())
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const markDownloaded = useCallback((entry: DouyinDownloadedEntry) => {
    setById((prev) => {
      const next = new Map(prev)
      next.set(entry.awemeId, entry)
      return next
    })
  }, [])

  return { byId, reload, markDownloaded }
}
