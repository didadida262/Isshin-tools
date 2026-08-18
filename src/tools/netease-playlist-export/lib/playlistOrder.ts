import type { NeteasePlaylist, NeteaseTrack } from '../types'

/** NetEase 「我喜欢的音乐」：最新在最上，显示时倒过来。 */
export const LIKED_SPECIAL_TYPE = 5

export function isLikedPlaylist(playlist: NeteasePlaylist | null) {
  if (!playlist) return false
  return playlist.specialType === LIKED_SPECIAL_TYPE || playlist.name.endsWith('喜欢的音乐')
}

export function displayTracks(
  playlist: NeteasePlaylist | null,
  tracks: NeteaseTrack[],
): NeteaseTrack[] {
  if (isLikedPlaylist(playlist)) {
    return [...tracks].reverse()
  }
  return tracks
}

export function seqWidth(total: number) {
  return Math.max(4, String(Math.max(total, 1)).length)
}

export function formatPlaylistSeq(index1: number, total: number) {
  return String(index1).padStart(seqWidth(total), '0')
}

export function seqMapBySongId(tracks: NeteaseTrack[]) {
  const map = new Map<number, number>()
  tracks.forEach((track, i) => {
    map.set(track.songId, i + 1)
  })
  return map
}
