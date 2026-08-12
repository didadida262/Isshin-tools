import { useCallback, useEffect, useRef, useState } from 'react'
import { listAweme } from '../api/douyinApi'
import type { DouyinAweme, DouyinListKind } from '../types'

type KindListState = {
  items: DouyinAweme[]
  cursor: number
  hasMore: boolean
  error: string | null
  loaded: boolean
}

const emptyState = (): KindListState => ({
  items: [],
  cursor: 0,
  hasMore: false,
  error: null,
  loaded: false,
})

export function useAwemeList(
  cookie: string | null,
  secUid: string | null,
  kind: DouyinListKind,
) {
  const [byKind, setByKind] = useState<Record<DouyinListKind, KindListState>>({
    favorite: emptyState(),
    post: emptyState(),
  })
  const [loadingKind, setLoadingKind] = useState<DouyinListKind | null>(null)
  const reqSeq = useRef(0)
  const byKindRef = useRef(byKind)
  byKindRef.current = byKind

  const state = byKind[kind]
  // 未加载完成前视为 loading，避免 tab 切换首帧闪「暂无内容」
  const loading =
    loadingKind === kind ||
    (!!cookie && !!secUid && !state.loaded && !state.error)

  const reload = useCallback(async () => {
    if (!cookie || !secUid) {
      setByKind({ favorite: emptyState(), post: emptyState() })
      setLoadingKind(null)
      return
    }

    const target = kind
    const seq = ++reqSeq.current
    setLoadingKind(target)
    setByKind((prev) => ({
      ...prev,
      [target]: emptyState(),
    }))

    try {
      const result = await listAweme(cookie, secUid, target, 0)
      if (seq !== reqSeq.current) return
      setByKind((prev) => ({
        ...prev,
        [target]: {
          items: result.items,
          cursor: result.maxCursor,
          hasMore: result.hasMore,
          error: null,
          loaded: true,
        },
      }))
    } catch (e) {
      if (seq !== reqSeq.current) return
      setByKind((prev) => ({
        ...prev,
        [target]: {
          ...emptyState(),
          error: e instanceof Error ? e.message : String(e),
        },
      }))
    } finally {
      if (seq === reqSeq.current) setLoadingKind(null)
    }
  }, [cookie, secUid, kind])

  const loadMore = useCallback(async () => {
    if (!cookie || !secUid || !state.hasMore || loading) return

    const target = kind
    const seq = ++reqSeq.current
    const cursor = state.cursor
    setLoadingKind(target)

    try {
      const result = await listAweme(cookie, secUid, target, cursor)
      if (seq !== reqSeq.current) return
      setByKind((prev) => {
        const current = prev[target]
        const seen = new Set(current.items.map((x) => x.awemeId))
        const merged = [...current.items]
        for (const item of result.items) {
          if (!seen.has(item.awemeId)) merged.push(item)
        }
        return {
          ...prev,
          [target]: {
            items: merged,
            cursor: result.maxCursor,
            hasMore: result.hasMore,
            error: null,
            loaded: true,
          },
        }
      })
    } catch (e) {
      if (seq !== reqSeq.current) return
      setByKind((prev) => ({
        ...prev,
        [target]: {
          ...prev[target],
          error: e instanceof Error ? e.message : String(e),
        },
      }))
    } finally {
      if (seq === reqSeq.current) setLoadingKind(null)
    }
  }, [cookie, secUid, kind, state.cursor, state.hasMore, loading])

  useEffect(() => {
    if (!cookie || !secUid) {
      setByKind({ favorite: emptyState(), post: emptyState() })
      setLoadingKind(null)
      return
    }
    // 已缓存的 tab 直接展示，避免串数据 / 重复请求
    if (byKindRef.current[kind].loaded) return
    void reload()
  }, [cookie, secUid, kind, reload])

  return {
    items: state.items,
    loading,
    error: state.error,
    hasMore: state.hasMore,
    reload,
    loadMore,
  }
}
