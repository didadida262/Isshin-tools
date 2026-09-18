import { useCallback, useEffect, useState } from 'react'
import { fetchFudanHospitalRanking } from '../api/fudanRanking'
import { errorMessage } from '../api/http'
import type { HospitalRankingSnapshot } from '../types'

export function useHospitalRanking(initialYear?: number) {
  const [snapshot, setSnapshot] = useState<HospitalRankingSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async (year?: number) => {
    setLoading(true)
    setError(null)
    try {
      const next = await fetchFudanHospitalRanking(year)
      setSnapshot(next)
    } catch (e) {
      setError(errorMessage(e) || '加载失败')
      setSnapshot((prev) => (year != null && prev ? prev : null))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload(initialYear)
  }, [initialYear, reload])

  return { snapshot, loading, error, reload }
}
