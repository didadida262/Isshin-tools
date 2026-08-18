import {
  downloadBilibili,
  searchBilibili,
  type BiliDownloadedEntry,
} from '../api/bilibiliSniff'
import type { NeteasePlaylist, NeteaseTrack } from '../types'

export type SniffAutoOutcome =
  | { status: 'downloaded'; entry: BiliDownloadedEntry }
  | { status: 'empty' }
  | { status: 'error'; message: string }
  | { status: 'aborted' }

function randomIntInclusive(min: number, max: number) {
  return min + Math.floor(Math.random() * (max - min + 1))
}

function sleepSec(sec: number, isCancelled: () => boolean) {
  return new Promise<void>((resolve) => {
    const started = Date.now()
    const total = sec * 1000
    const tick = () => {
      if (isCancelled() || Date.now() - started >= total) {
        resolve()
        return
      }
      window.setTimeout(tick, 50)
    }
    tick()
  })
}

const EMPTY_RETRY_MAX = 3
const EMPTY_WAIT_MIN = 8
const EMPTY_WAIT_MAX = 20

/**
 * 无 UI 的批量嗅探下载：搜索 → 随机等待 → 依次尝试候选稿件。
 * 供网易工具后台批量使用，不依赖弹框挂载。
 */
export async function runAutoSniffDownload(opts: {
  track: NeteaseTrack
  playlist: NeteasePlaylist | null
  isCancelled: () => boolean
  onStatus?: (text: string) => void
}): Promise<SniffAutoOutcome> {
  const { track, playlist, isCancelled, onStatus } = opts
  const keyword = [track.name, track.artists].filter(Boolean).join(' ')
  const durationMs = track.durationMs || undefined
  const preferredTitle = `${track.artists || '未知'} - ${track.name}`

  let items: Awaited<ReturnType<typeof searchBilibili>> = []
  let attempt = 0

  while (!isCancelled()) {
    attempt += 1
    try {
      onStatus?.(
        attempt === 1
          ? `正在 B 站搜索：${track.name}`
          : `正在重试搜索（第 ${attempt}/${EMPTY_RETRY_MAX} 次）：${track.name}`,
      )
      items = await searchBilibili(keyword, durationMs)
      if (isCancelled()) return { status: 'aborted' }

      if (items.length === 0 && attempt < EMPTY_RETRY_MAX) {
        const waitSec = randomIntInclusive(EMPTY_WAIT_MIN, EMPTY_WAIT_MAX)
        onStatus?.(
          `搜索结果为空，疑似短暂限流，${waitSec}s 后重试（${attempt}/${EMPTY_RETRY_MAX}）…`,
        )
        await sleepSec(waitSec, isCancelled)
        if (isCancelled()) return { status: 'aborted' }
        continue
      }
      break
    } catch (e) {
      if (isCancelled()) return { status: 'aborted' }
      const message = e instanceof Error ? e.message : String(e)
      const looksLikeLimit =
        /频繁|风控|限流|412|403|429|empty|空/i.test(message) ||
        message.includes('-412') ||
        message.includes('412')

      if (looksLikeLimit && attempt < EMPTY_RETRY_MAX) {
        const waitSec = randomIntInclusive(EMPTY_WAIT_MIN, EMPTY_WAIT_MAX)
        onStatus?.(
          `搜索异常（${message}），${waitSec}s 后重试（${attempt}/${EMPTY_RETRY_MAX}）…`,
        )
        await sleepSec(waitSec, isCancelled)
        if (isCancelled()) return { status: 'aborted' }
        continue
      }
      return { status: 'error', message }
    }
  }

  if (isCancelled()) return { status: 'aborted' }
  if (items.length === 0) return { status: 'empty' }

  for (let i = 0; i < items.length; i += 1) {
    if (isCancelled()) return { status: 'aborted' }
    const item = items[i]
    if (!item) continue

    const waitSec = randomIntInclusive(1, 3)
    onStatus?.(
      i === 0
        ? `资源已就绪，${waitSec}s 后下载「${track.name}」第 1 个结果…`
        : `上一条取流失败，${waitSec}s 后尝试「${track.name}」第 ${i + 1} 个结果…`,
    )
    await sleepSec(waitSec, isCancelled)
    if (isCancelled()) return { status: 'aborted' }

    onStatus?.(`正在下载「${track.name}」第 ${i + 1}/${items.length} 个资源…`)
    try {
      const result = await downloadBilibili({
        bvid: item.bvid,
        songId: track.songId,
        playlistId: playlist?.id,
        playlistName: playlist?.name,
        preferredTitle,
        artists: track.artists,
      })
      if (isCancelled()) return { status: 'aborted' }

      const entry: BiliDownloadedEntry = {
        songId: track.songId,
        playlistId: playlist?.id ?? null,
        playlistName: playlist?.name ?? null,
        path: result.path,
        bvid: result.bvid,
        title: preferredTitle,
        artists: track.artists || null,
        downloadedAt: Math.floor(Date.now() / 1000),
      }
      return { status: 'downloaded', entry }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      onStatus?.(`第 ${i + 1} 个失败：${message}`)
      if (i >= items.length - 1) {
        return { status: 'empty' }
      }
    }
  }

  return { status: 'empty' }
}
