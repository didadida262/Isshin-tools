import { useCallback, useEffect, useRef, useState } from 'react'
import {
  fetchGoldFactorsSnapshot,
  fetchRealtimeGoldFactors,
} from '../api/GoldFactorsClient'
import type { FactorMetric, GoldFactorsSnapshot } from '../types'

/** Near-realtime quotes only (Sina). Full snapshot includes Treasury / WGC. */
const REALTIME_INTERVAL_MS = 500
const SLOW_INTERVAL_MS = 5 * 60_000

function applyStatus(
  metrics: FactorMetric[],
  setError: (value: string | null) => void,
) {
  const failed = metrics.filter((m) => Boolean(m.error))
  const ok = metrics.filter((m) => m.value !== null)
  if (ok.length === 0) {
    setError(failed[0]?.error ?? '全部因子拉取失败')
  } else if (failed.length > 0) {
    setError(`部分因子失败（${failed.length}）· 已展示可用数据`)
  } else {
    setError(null)
  }
  return ok.length > 0
}

function mergeRealtime(
  prev: GoldFactorsSnapshot,
  patch: Awaited<ReturnType<typeof fetchRealtimeGoldFactors>>,
): GoldFactorsSnapshot {
  const byId: Record<string, FactorMetric> = {
    'xau-usd': patch.spotGold,
    dxy: patch.dxy,
    'vix-proxy': patch.risk,
  }
  const metrics = prev.metrics.map((m) => byId[m.id] ?? m)
  return {
    fetchedAt: patch.fetchedAt,
    metrics,
    spotGold: patch.spotGold.value !== null ? patch.spotGold : prev.spotGold,
    shanghaiGold:
      patch.shanghaiGold.value !== null ? patch.shanghaiGold : prev.shanghaiGold,
  }
}

export function useGoldFactors() {
  const [snapshot, setSnapshot] = useState<GoldFactorsSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const hasDataRef = useRef(false)
  const inflightRef = useRef(false)

  const reloadFull = useCallback(async (background = false) => {
    if (!background && !hasDataRef.current) setLoading(true)
    try {
      const next = await fetchGoldFactorsSnapshot()
      setSnapshot(next)
      hasDataRef.current = applyStatus(next.metrics, setError)
    } catch (e) {
      setError(e instanceof Error ? e.message : '拉取失败')
    } finally {
      setLoading(false)
    }
  }, [])

  const reloadRealtime = useCallback(async () => {
    if (inflightRef.current || !hasDataRef.current) return
    inflightRef.current = true
    try {
      const patch = await fetchRealtimeGoldFactors()
      setSnapshot((prev) => {
        if (!prev) return prev
        const next = mergeRealtime(prev, patch)
        applyStatus(next.metrics, setError)
        return next
      })
    } catch {
      // Keep last good snapshot on transient realtime failures.
    } finally {
      inflightRef.current = false
    }
  }, [])

  useEffect(() => {
    void reloadFull(false)
  }, [reloadFull])

  useEffect(() => {
    const id = window.setInterval(() => {
      void reloadRealtime()
    }, REALTIME_INTERVAL_MS)
    return () => window.clearInterval(id)
  }, [reloadRealtime])

  useEffect(() => {
    const id = window.setInterval(() => {
      void reloadFull(true)
    }, SLOW_INTERVAL_MS)
    return () => window.clearInterval(id)
  }, [reloadFull])

  return {
    snapshot,
    loading,
    error,
    reload: () => void reloadFull(false),
  }
}
