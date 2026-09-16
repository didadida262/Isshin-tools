import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faChevronLeft } from '@fortawesome/free-solid-svg-icons'
import { ErrorState } from '@/components/ErrorState'
import { PlaylistListSkeleton } from '@/components/Skeleton'
import type { NeteasePlaylist } from '../types'

interface PlaylistListProps {
  playlists: NeteasePlaylist[]
  loading: boolean
  error: string | null
  selectedId: number | null
  onSelect: (playlist: NeteasePlaylist) => void
  onRetry: () => void
  onCollapse: () => void
}

export function PlaylistList({
  playlists,
  loading,
  error,
  selectedId,
  onSelect,
  onRetry,
  onCollapse,
}: PlaylistListProps) {
  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-border-subtle bg-surface/95 shadow-lg shadow-black/20 backdrop-blur-md">
      <header className="shrink-0 border-b border-border-subtle px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <h3 className="text-sm font-medium text-foreground">歌单</h3>
            <span className="text-[11px] text-subtle">{playlists.length}</span>
          </div>
          <button
            type="button"
            onClick={onCollapse}
            title="收起为浮动图标"
            aria-label="收起歌单列表"
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-subtle transition-colors duration-200 hover:bg-surface-hover hover:text-foreground"
          >
            <FontAwesomeIcon icon={faChevronLeft} className="h-3 w-3" />
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading && <PlaylistListSkeleton />}
        {!loading && error && (
          <ErrorState message={error} onRetry={onRetry} title="歌单加载失败" />
        )}
        {!loading && !error && playlists.length === 0 && (
          <p className="px-4 py-10 text-center text-xs text-muted">暂无歌单</p>
        )}
        {!loading && !error && playlists.length > 0 && (
          <ul className="space-y-0.5 p-2">
            {playlists.map((playlist) => {
              const active = playlist.id === selectedId
              return (
                <li key={playlist.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(playlist)}
                    className={`flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors duration-150 ${
                      active
                        ? 'bg-surface-hover shadow-sm ring-1 ring-border'
                        : 'hover:bg-surface-hover/70'
                    }`}
                  >
                    <img
                      src={playlist.coverImgUrl}
                      alt=""
                      className="h-10 w-10 shrink-0 rounded-lg object-cover"
                      loading="lazy"
                      referrerPolicy="no-referrer"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-foreground">
                        {playlist.name}
                      </span>
                      <span className="mt-0.5 block text-[11px] text-subtle">
                        {playlist.trackCount} 首
                      </span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )
}
