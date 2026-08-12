import { useState } from 'react'
import { LoginPanel } from './components/LoginPanel'
import { PlaylistList } from './components/PlaylistList'
import { TrackPanel } from './components/TrackPanel'
import { useNeteaseAuth } from './hooks/useNeteaseAuth'
import { usePlaylists } from './hooks/usePlaylists'
import { usePlaylistTracks } from './hooks/usePlaylistTracks'
import type { NeteasePlaylist } from './types'

export function NeteasePlaylistExportTool() {
  const auth = useNeteaseAuth()
  const userId = auth.profile?.userId ?? null
  const { playlists, loading: playlistsLoading, error: playlistsError, reload: reloadPlaylists } =
    usePlaylists(userId)

  const [selected, setSelected] = useState<NeteasePlaylist | null>(null)
  const [playlistFilter, setPlaylistFilter] = useState('')
  const {
    tracks,
    loading: tracksLoading,
    error: tracksError,
    reload: reloadTracks,
  } = usePlaylistTracks(selected?.id ?? null)

  return (
    <div className="flex h-full flex-col gap-4 overflow-hidden p-5 md:p-6">
      <header className="shrink-0">
        <h1 className="font-display text-xl font-semibold tracking-tight text-foreground">
          网易云音乐歌单导出
        </h1>
        <p className="mt-1 text-xs text-muted">
          导出歌名、歌手、专辑等基础元数据 · JSON / CSV · B站资源嗅探
        </p>
      </header>

      <div className="shrink-0">
        <LoginPanel
          status={auth.status}
          profile={auth.profile}
          error={auth.error}
          qrSession={auth.qrSession}
          onStartQr={() => void auth.startQrLogin()}
          onCookieLogin={(c) => void auth.loginWithCookie(c)}
          onLogout={() => {
            setSelected(null)
            void auth.logout()
          }}
        />
      </div>

      {auth.status === 'authenticated' ? (
        <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(240px,320px)_1fr]">
          <PlaylistList
            playlists={playlists}
            loading={playlistsLoading}
            error={playlistsError}
            selectedId={selected?.id ?? null}
            filter={playlistFilter}
            onFilterChange={setPlaylistFilter}
            onSelect={setSelected}
            onRetry={() => void reloadPlaylists()}
          />
          <TrackPanel
            playlist={selected}
            tracks={tracks}
            loading={tracksLoading}
            error={tracksError}
            onRetry={() => void reloadTracks()}
          />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 items-center justify-center rounded-2xl border border-dashed border-border-subtle">
          <p className="max-w-sm px-6 text-center text-xs leading-relaxed text-muted">
            登录后将展示账户下全部歌单（含「我喜欢的音乐」），选择歌单即可导出元数据。
          </p>
        </div>
      )}
    </div>
  )
}

export default NeteasePlaylistExportTool
