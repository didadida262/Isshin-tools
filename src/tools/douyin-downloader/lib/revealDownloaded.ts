import { exists } from '@tauri-apps/plugin-fs'
import { revealItemInDir } from '@tauri-apps/plugin-opener'
import { listDownloaded } from '../api/douyinApi'
import { downloadedKey } from '../hooks/useDownloadedAweme'
import type { DouyinDownloadedEntry, DouyinListKind } from '../types'

/**
 * Reveal a downloaded file in Finder/Explorer.
 * If the indexed path is stale (seq rename / extension change), refresh the
 * index and retry once so the folder button does not fail silently.
 */
export async function revealDownloaded(
  entry: DouyinDownloadedEntry,
  kind: DouyinListKind,
  onResolved?: (entry: DouyinDownloadedEntry) => void,
): Promise<void> {
  const tryReveal = async (path: string) => {
    if (!(await exists(path))) {
      throw new Error('文件不存在或已移动')
    }
    await revealItemInDir(path)
  }

  try {
    await tryReveal(entry.path)
    return
  } catch (first) {
    const entries = await listDownloaded()
    const fresh = entries.find(
      (e) => downloadedKey(e.awemeId, e.kind) === downloadedKey(entry.awemeId, kind),
    )
    if (!fresh) {
      throw first instanceof Error ? first : new Error(String(first))
    }
    onResolved?.(fresh)
    await tryReveal(fresh.path)
  }
}
