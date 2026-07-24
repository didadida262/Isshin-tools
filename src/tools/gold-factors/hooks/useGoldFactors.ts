import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchGoldFactorsSnapshot } from '../api/GoldFactorsClient'
import type { GoldFactorsSnapshot } from '../types'

const DEFAULT_INTERVAL_MS = 60_000

export function useGoldFactors(autoRefresh: boolean, intervalMs = DEFAULT_INTERVAL_MS) {
  const [snapshot, setSnapshot] = useState<GoldFactorsSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const hasDataRef = useRef(false)

  const reload = useCallback(async (isManual = false) => {
    if (isManual || hasDataRef.current) setRefreshing(true)
    else setLoading(true)

    setError(null)
    try {
      const next = await fetchGoldFactorsSnapshot()
      const failed = next.metrics.filter((m) => m.error && m.id !== 'cb-gold')
      const ok = next.metrics.filter((m) => m.value !== null)
      setSnapshot(next)
      hasDataRef.current = ok.length > 0

      if (ok.length === 0) {
        setError(failed[0]?.error ?? '全部因子拉取失败')
      } else if (failed.length > 0) {
        setError(`部分因子失败（${failed.length}）· 已展示可用数据`)
      } else {
        setError(null)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '拉取失败')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void reload(false)
  }, [reload])

  useEffect(() => {
    if (!autoRefresh) return
    const id = window.setInterval(() => {
      void reload(true)
    }, intervalMs)
    return () => window.clearInterval(id)
  }, [autoRefresh, intervalMs, reload])

  return {
    snapshot,
    loading,
    refreshing,
    error,
    reload: () => void reload(true),
  }
}
