import { useCallback, useEffect, useState } from 'react'
import {
  deleteDownloadedBilibili,
  listDownloadedBilibili,
  syncDownloadedBilibili,
  type BiliDownloadedEntry,
  type BiliSyncResult,
} from '../api/bilibiliSniff'

function entriesToMap(entries: BiliDownloadedEntry[]) {
  const next = new Map<number, BiliDownloadedEntry>()
  for (const entry of entries) {
    next.set(entry.songId, entry)
  }
  return next
}

export function useDownloadedTracks() {
  const [bySongId, setBySongId] = useState<Map<number, BiliDownloadedEntry>>(
    () => new Map(),
  )
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const entries = await listDownloadedBilibili()
      setBySongId(entriesToMap(entries))
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

  const deleteDownloaded = useCallback(async (songId: number) => {
    await deleteDownloadedBilibili(songId)
    setBySongId((prev) => {
      const next = new Map(prev)
      next.delete(songId)
      return next
    })
  }, [])

  const syncFromDisk = useCallback(async (): Promise<BiliSyncResult> => {
    setSyncing(true)
    try {
      const result = await syncDownloadedBilibili()
      setBySongId(entriesToMap(result.entries))
      return result
    } finally {
      setSyncing(false)
    }
  }, [])

  return {
    bySongId,
    loading,
    syncing,
    reload,
    markDownloaded,
    deleteDownloaded,
    syncFromDisk,
  }
}
