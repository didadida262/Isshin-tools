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

export type LoadMoreOutcome =
  | { status: 'ok'; added: number; hasMore: boolean }
  | { status: 'empty'; message: string; hasMore: boolean }
  | { status: 'error'; message: string }
  | { status: 'noop'; reason: 'no-more' | 'busy' | 'missing-auth' }

export function useAwemeList(secUid: string | null, kind: DouyinListKind) {
  const [byKind, setByKind] = useState<Record<DouyinListKind, KindListState>>({
    favorite: emptyState(),
    post: emptyState(),
    collect_music: emptyState(),
  })
  const [loadingKind, setLoadingKind] = useState<DouyinListKind | null>(null)
  const reqSeq = useRef(0)
  const byKindRef = useRef(byKind)
  byKindRef.current = byKind
  const loadingKindRef = useRef(loadingKind)
  loadingKindRef.current = loadingKind

  const state = byKind[kind]
  // 未加载完成前视为 loading，避免 tab 切换首帧闪「暂无内容」
  const loading = loadingKind === kind || (!!secUid && !state.loaded && !state.error)

  const reload = useCallback(async (options?: { clear?: boolean }) => {
    if (!secUid) {
      const empty = {
        favorite: emptyState(),
        post: emptyState(),
        collect_music: emptyState(),
      }
      byKindRef.current = empty
      setByKind(empty)
      setLoadingKind(null)
      return null
    }

    const target = kind
    const seq = ++reqSeq.current
    setLoadingKind(target)
    if (options?.clear !== false) {
      setByKind((prev) => {
        const next = { ...prev, [target]: emptyState() }
        byKindRef.current = next
        return next
      })
    }

    try {
      const result = await listAweme(secUid, target, 0)
      if (seq !== reqSeq.current) return null
      const nextState: KindListState = {
        items: result.items,
        cursor: result.maxCursor,
        hasMore: result.hasMore,
        error: null,
        loaded: true,
      }
      setByKind((prev) => {
        const next = { ...prev, [target]: nextState }
        byKindRef.current = next
        return next
      })
      return { items: result.items, hasMore: result.hasMore }
    } catch (e) {
      if (seq !== reqSeq.current) return null
      setByKind((prev) => {
        const next = {
          ...prev,
          [target]: {
            ...emptyState(),
            error: e instanceof Error ? e.message : String(e),
          },
        }
        byKindRef.current = next
        return next
      })
      return null
    } finally {
      if (seq === reqSeq.current) setLoadingKind(null)
    }
  }, [secUid, kind])

  const loadMore = useCallback(async (): Promise<LoadMoreOutcome> => {
    if (!secUid) return { status: 'noop', reason: 'missing-auth' }

    const target = kind
    const current = byKindRef.current[target]
    if (!current.hasMore) return { status: 'noop', reason: 'no-more' }
    if (loadingKindRef.current === target) return { status: 'noop', reason: 'busy' }

    const seq = ++reqSeq.current
    const cursor = current.cursor
    setLoadingKind(target)

    try {
      const result = await listAweme(secUid, target, cursor)
      if (seq !== reqSeq.current) {
        return { status: 'noop', reason: 'busy' }
      }

      const prevState = byKindRef.current[target]
      const seen = new Set(prevState.items.map((x) => x.awemeId))
      const merged = [...prevState.items]
      let added = 0
      for (const item of result.items) {
        if (!seen.has(item.awemeId)) {
          merged.push(item)
          seen.add(item.awemeId)
          added += 1
        }
      }

      setByKind((prev) => ({
        ...prev,
        [target]: {
          items: merged,
          cursor: result.maxCursor,
          hasMore: result.hasMore,
          error: null,
          loaded: true,
        },
      }))
      byKindRef.current = {
        ...byKindRef.current,
        [target]: {
          items: merged,
          cursor: result.maxCursor,
          hasMore: result.hasMore,
          error: null,
          loaded: true,
        },
      }

      if (added === 0) {
        return {
          status: 'empty',
          message:
            '加载更多返回空数据，可能已触发风控或列表异常，已停止批量下载',
          hasMore: result.hasMore,
        }
      }

      return { status: 'ok', added, hasMore: result.hasMore }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      if (seq !== reqSeq.current) {
        return { status: 'noop', reason: 'busy' }
      }
      setByKind((prev) => ({
        ...prev,
        [target]: {
          ...prev[target],
          error: message,
        },
      }))
      return { status: 'error', message }
    } finally {
      if (seq === reqSeq.current) setLoadingKind(null)
    }
  }, [secUid, kind])

  useEffect(() => {
    if (!secUid) {
      setByKind({
        favorite: emptyState(),
        post: emptyState(),
        collect_music: emptyState(),
      })
      setLoadingKind(null)
      return
    }
    // 已缓存的 tab 直接展示，避免串数据 / 重复请求
    if (byKindRef.current[kind].loaded) return
    void reload()
  }, [secUid, kind, reload])

  return {
    items: state.items,
    loading,
    error: state.error,
    hasMore: state.hasMore,
    reload,
    loadMore,
  }
}
