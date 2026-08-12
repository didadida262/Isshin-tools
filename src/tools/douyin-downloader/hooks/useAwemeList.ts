import { useCallback, useEffect, useState } from 'react'
import { listAweme } from '../api/douyinApi'
import type { DouyinAweme, DouyinListKind } from '../types'

export function useAwemeList(
  cookie: string | null,
  secUid: string | null,
  kind: DouyinListKind,
) {
  const [items, setItems] = useState<DouyinAweme[]>([])
  const [cursor, setCursor] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!cookie || !secUid) {
      setItems([])
      setCursor(0)
      setHasMore(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const result = await listAweme(cookie, secUid, kind, 0)
      setItems(result.items)
      setCursor(result.maxCursor)
      setHasMore(result.hasMore)
    } catch (e) {
      setItems([])
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [cookie, secUid, kind])

  const loadMore = useCallback(async () => {
    if (!cookie || !secUid || !hasMore || loading) return
    setLoading(true)
    setError(null)
    try {
      const result = await listAweme(cookie, secUid, kind, cursor)
      setItems((prev) => {
        const seen = new Set(prev.map((x) => x.awemeId))
        const merged = [...prev]
        for (const item of result.items) {
          if (!seen.has(item.awemeId)) merged.push(item)
        }
        return merged
      })
      setCursor(result.maxCursor)
      setHasMore(result.hasMore)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [cookie, secUid, kind, cursor, hasMore, loading])

  useEffect(() => {
    void reload()
  }, [reload])

  return { items, loading, error, hasMore, reload, loadMore }
}
