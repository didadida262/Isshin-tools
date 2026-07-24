import { useCallback, useEffect, useState } from 'react'
import { neteaseApi } from '../api/NeteaseApiClient'
import type { NeteasePlaylist } from '../types'

export function usePlaylists(userId: number | null) {
  const [playlists, setPlaylists] = useState<NeteasePlaylist[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (userId === null) {
      setPlaylists([])
      setError(null)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const list = await neteaseApi.getUserPlaylists(userId)
      setPlaylists(list)
    } catch (e) {
      setPlaylists([])
      setError(e instanceof Error ? e.message : '歌单加载失败')
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    void reload()
  }, [reload])

  return { playlists, loading, error, reload }
}
