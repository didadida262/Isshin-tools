import type { ExportFormat, ExportTrackRow, NeteasePlaylist, NeteaseTrack } from '../types'

const CSV_HEADERS: Array<keyof ExportTrackRow> = [
  'songId',
  'name',
  'artists',
  'album',
  'albumId',
  'durationMs',
  'playlistId',
  'playlistName',
  'exportedAt',
]

export function buildExportRows(
  playlist: NeteasePlaylist,
  tracks: NeteaseTrack[],
  exportedAt = new Date().toISOString(),
): ExportTrackRow[] {
  return tracks.map((t) => ({
    songId: t.songId,
    name: t.name,
    artists: t.artists,
    album: t.album,
    albumId: t.albumId,
    durationMs: t.durationMs,
    playlistId: playlist.id,
    playlistName: playlist.name,
    exportedAt,
  }))
}

function escapeCsv(value: string | number): string {
  const raw = String(value)
  if (/[",\n\r]/.test(raw)) {
    return `"${raw.replace(/"/g, '""')}"`
  }
  return raw
}

export function rowsToJson(rows: ExportTrackRow[]): string {
  return `${JSON.stringify(rows, null, 2)}\n`
}

export function rowsToCsv(rows: ExportTrackRow[]): string {
  const header = CSV_HEADERS.join(',')
  const lines = rows.map((row) =>
    CSV_HEADERS.map((key) => escapeCsv(row[key])).join(','),
  )
  return `${header}\n${lines.join('\n')}\n`
}

export function serializeExport(rows: ExportTrackRow[], format: ExportFormat): string {
  return format === 'json' ? rowsToJson(rows) : rowsToCsv(rows)
}

export function defaultExportFilename(
  playlistName: string,
  format: ExportFormat,
): string {
  const safe = playlistName.replace(/[\\/:*?"<>|]/g, '_').trim() || 'playlist'
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
  return `${safe}-${stamp}.${format}`
}
