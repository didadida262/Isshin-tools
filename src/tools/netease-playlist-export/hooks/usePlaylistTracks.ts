import { useCallback, useEffect, useState } from 'react'
import { neteaseApi } from '../api/NeteaseApiClient'
import type { NeteaseTrack } from '../types'

export function usePlaylistTracks(playlistId: number | null) {
  const [tracks, setTracks] = useState<NeteaseTrack[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (playlistId === null) {
      setTracks([])
      setError(null)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const list = await neteaseApi.getPlaylistTracks(playlistId)
      setTracks(list)
    } catch (e) {
      setTracks([])
      setError(e instanceof Error ? e.message : '歌曲加载失败')
    } finally {
      setLoading(false)
    }
  }, [playlistId])

  useEffect(() => {
    void reload()
  }, [reload])

  return { tracks, loading, error, reload }
}
