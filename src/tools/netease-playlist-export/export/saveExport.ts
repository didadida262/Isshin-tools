import { save } from '@tauri-apps/plugin-dialog'
import { writeTextFile } from '@tauri-apps/plugin-fs'
import { revealItemInDir } from '@tauri-apps/plugin-opener'
import type { ExportFormat, ExportTrackRow } from '../types'
import { defaultExportFilename, serializeExport } from './exportMetadata'

export interface ExportResult {
  path: string
}

export async function exportPlaylistFile(
  rows: ExportTrackRow[],
  playlistName: string,
  format: ExportFormat,
): Promise<ExportResult> {
  if (rows.length === 0) {
    throw new Error('当前歌单没有可导出的歌曲')
  }

  const filename = defaultExportFilename(playlistName, format)
  const filters =
    format === 'json'
      ? [{ name: 'JSON', extensions: ['json'] }]
      : [{ name: 'CSV', extensions: ['csv'] }]

  const path = await save({
    defaultPath: filename,
    filters,
  })

  if (!path) {
    throw new Error('已取消导出')
  }

  const content = serializeExport(rows, format)
  await writeTextFile(path, content)
  return { path }
}

export async function revealExport(path: string) {
  await revealItemInDir(path)
}
