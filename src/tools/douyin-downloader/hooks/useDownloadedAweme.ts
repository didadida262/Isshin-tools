import { useCallback, useMemo, useState } from 'react'
import { useResyncWhenVisible } from '@/shell/useResyncWhenVisible'
import { listDownloaded } from '../api/douyinApi'
import type { DouyinDownloadedEntry, DouyinListKind } from '../types'

/** likes / works — must match Rust `normalize_kind_folder` */
export function kindFolder(kind: DouyinListKind | string): 'likes' | 'works' {
  const k = kind.trim().toLowerCase()
  if (k === 'favorite' || k === 'like' || k === 'likes') return 'likes'
  return 'works'
}

export function downloadedKey(awemeId: string, kind: DouyinListKind | string) {
  return `${kindFolder(kind)}:${awemeId}`
}

export function useDownloadedAweme() {
  const [byKey, setByKey] = useState<Map<string, DouyinDownloadedEntry>>(
    () => new Map(),
  )

  const reload = useCallback(async () => {
    try {
      const entries = await listDownloaded()
      const next = new Map<string, DouyinDownloadedEntry>()
      for (const entry of entries) {
        next.set(downloadedKey(entry.awemeId, entry.kind), entry)
      }
      setByKey((prev) => {
        if (prev.size !== next.size) return next
        for (const [key, entry] of next) {
          const old = prev.get(key)
          if (!old || old.path !== entry.path) return next
        }
        return prev
      })
    } catch {
      setByKey((prev) => (prev.size === 0 ? prev : new Map()))
    }
  }, [])

  useResyncWhenVisible(reload)

  const markDownloaded = useCallback((entry: DouyinDownloadedEntry) => {
    setByKey((prev) => {
      const next = new Map(prev)
      next.set(downloadedKey(entry.awemeId, entry.kind), entry)
      return next
    })
  }, [])

  /** awemeId → entry，仅含当前喜欢/作品分类 */
  const forKind = useCallback(
    (kind: DouyinListKind) => {
      const folder = kindFolder(kind)
      const map = new Map<string, DouyinDownloadedEntry>()
      for (const entry of byKey.values()) {
        if (kindFolder(entry.kind) === folder) {
          map.set(entry.awemeId, entry)
        }
      }
      return map
    },
    [byKey],
  )

  return { byKey, forKind, reload, markDownloaded }
}

export function useDownloadedMapForKind(
  byKey: Map<string, DouyinDownloadedEntry>,
  kind: DouyinListKind,
) {
  return useMemo(() => {
    const folder = kindFolder(kind)
    const map = new Map<string, DouyinDownloadedEntry>()
    for (const entry of byKey.values()) {
      if (kindFolder(entry.kind) === folder) {
        map.set(entry.awemeId, entry)
      }
    }
    return map
  }, [byKey, kind])
}
