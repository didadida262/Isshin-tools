import { useState } from 'react'
import { LoginPanel } from './components/LoginPanel'
import { PlaylistList } from './components/PlaylistList'
import { FloatingPlaylistLogo } from './components/FloatingPlaylistLogo'
import { TrackPanel } from './components/TrackPanel'
import { useNeteaseAuth } from './hooks/useNeteaseAuth'
import { usePlaylists } from './hooks/usePlaylists'
import { usePlaylistTracks } from './hooks/usePlaylistTracks'
import type { NeteasePlaylist } from './types'

const PLAYLIST_WIDTH = 280
const PLAYLIST_GAP = 16

export function NeteasePlaylistExportTool() {
  const auth = useNeteaseAuth()
  const userId = auth.profile?.userId ?? null
  const { playlists, loading: playlistsLoading, error: playlistsError, reload: reloadPlaylists } =
    usePlaylists(userId)

  const [selected, setSelected] = useState<NeteasePlaylist | null>(null)
  const [playlistCollapsed, setPlaylistCollapsed] = useState(false)
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
          网易云音乐下载器
        </h1>
        <p className="mt-1 text-xs text-muted">
          导出歌名、歌手、专辑等基础元数据 · JSON / CSV · B站嗅探下载到 downloads/网易云音乐
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
            setPlaylistCollapsed(false)
            void auth.logout()
          }}
        />
      </div>

      {auth.status === 'authenticated' ? (
        <div className="relative min-h-0 flex-1 overflow-hidden">
          {/*
            Padding snaps once; virtualized track rows keep the reflow cheap.
            Playlist stays mounted and only uses GPU transform.
          */}
          <div
            className="h-full min-h-0"
            style={{
              paddingLeft: playlistCollapsed ? 0 : PLAYLIST_WIDTH + PLAYLIST_GAP,
            }}
          >
            <TrackPanel
              playlist={selected}
              tracks={tracks}
              loading={tracksLoading}
              error={tracksError}
              onRetry={() => void reloadTracks()}
            />
          </div>

          <aside
            aria-hidden={playlistCollapsed}
            className="absolute inset-y-0 left-0 z-20 will-change-transform"
            style={{
              width: PLAYLIST_WIDTH,
              transform: playlistCollapsed
                ? 'translate3d(calc(-100% - 12px), 0, 0)'
                : 'translate3d(0, 0, 0)',
              opacity: playlistCollapsed ? 0 : 1,
              pointerEvents: playlistCollapsed ? 'none' : 'auto',
              transition:
                'transform 0.2s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.16s ease',
            }}
          >
            <PlaylistList
              playlists={playlists}
              loading={playlistsLoading}
              error={playlistsError}
              selectedId={selected?.id ?? null}
              onSelect={setSelected}
              onRetry={() => void reloadPlaylists()}
              onCollapse={() => setPlaylistCollapsed(true)}
            />
          </aside>

          <FloatingPlaylistLogo
            visible={playlistCollapsed}
            onExpand={() => setPlaylistCollapsed(false)}
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
