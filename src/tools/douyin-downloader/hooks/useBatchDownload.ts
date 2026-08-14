import { useCallback, useEffect, useRef, useState } from 'react'
import { downloadAweme } from '../api/douyinApi'
import type { LoadMoreOutcome } from './useAwemeList'
import type {
  DouyinAweme,
  DouyinDownloadedEntry,
  DouyinListKind,
} from '../types'

export type BatchPhase =
  | 'idle'
  | 'downloading'
  | 'waiting'
  | 'loadingMore'
  | 'stopping'
  | 'paused'
  | 'stopped'
  | 'done'

export type BatchStopReason = 'user' | 'risk' | 'error' | 'limit' | 'complete'

const MAX_LOAD_MORE = 3
const DELAY_MIN_MS = 1000
const DELAY_MAX_MS = 3000

function randomDelayMs() {
  return DELAY_MIN_MS + Math.floor(Math.random() * (DELAY_MAX_MS - DELAY_MIN_MS + 1))
}

function sleep(ms: number, isCancelled: () => boolean) {
  return new Promise<void>((resolve) => {
    const started = Date.now()
    const tick = () => {
      if (isCancelled() || Date.now() - started >= ms) {
        resolve()
        return
      }
      window.setTimeout(tick, 50)
    }
    tick()
  })
}

function looksLikeRiskControl(message: string) {
  const text = message.toLowerCase()
  return (
    text.includes('风控') ||
    text.includes('空响应') ||
    text.includes('空数据') ||
    text.includes('cookie') ||
    text.includes('登录') ||
    text.includes('session') ||
    text.includes('status_code') ||
    text.includes('forbidden') ||
    text.includes('401') ||
    text.includes('403')
  )
}

interface UseBatchDownloadParams {
  cookie: string
  kind: DouyinListKind
  items: DouyinAweme[]
  hasMore: boolean
  downloadedById: Map<string, DouyinDownloadedEntry>
  loadMore: () => Promise<LoadMoreOutcome>
  onDownloaded: (entry: DouyinDownloadedEntry) => void
}

export function useBatchDownload({
  cookie,
  kind,
  items,
  hasMore,
  downloadedById,
  loadMore,
  onDownloaded,
}: UseBatchDownloadParams) {
  const [phase, setPhase] = useState<BatchPhase>('idle')
  const [activeId, setActiveId] = useState<string | null>(null)
  const [loadMoreUsed, setLoadMoreUsed] = useState(0)
  const [successCount, setSuccessCount] = useState(0)
  const [statusText, setStatusText] = useState<string | null>(null)
  const [stopMessage, setStopMessage] = useState<string | null>(null)
  const [stopReason, setStopReason] = useState<BatchStopReason | null>(null)

  const cancelRef = useRef(false)
  const runningRef = useRef(false)
  const itemsRef = useRef(items)
  const hasMoreRef = useRef(hasMore)
  const downloadedRef = useRef(downloadedById)

  itemsRef.current = items
  hasMoreRef.current = hasMore
  downloadedRef.current = downloadedById

  const isActive =
    phase === 'downloading' ||
    phase === 'waiting' ||
    phase === 'loadingMore' ||
    phase === 'stopping'

  useEffect(() => {
    cancelRef.current = true
    runningRef.current = false
    setPhase('idle')
    setActiveId(null)
    setLoadMoreUsed(0)
    setSuccessCount(0)
    setStatusText(null)
    setStopMessage(null)
    setStopReason(null)
  }, [kind, cookie])

  const stop = useCallback(() => {
    if (!runningRef.current) return
    cancelRef.current = true
    setPhase('stopping')
    setStatusText('正在停止…')
  }, [])

  const clearStopBanner = useCallback(() => {
    setStopMessage(null)
    setStopReason(null)
    if (phase === 'stopped' || phase === 'done' || phase === 'paused') {
      setPhase('idle')
      setActiveId(null)
      setStatusText(null)
    }
  }, [phase])

  const start = useCallback(async () => {
    if (runningRef.current) return
    runningRef.current = true
    cancelRef.current = false
    setStopMessage(null)
    setStopReason(null)
    setSuccessCount(0)
    setLoadMoreUsed(0)
    setStatusText('准备批量下载…')

    let localSuccess = 0
    let localLoadMore = 0
    const folder = kind === 'favorite' ? 'likes' : 'works'
    const kindLabel = kind === 'favorite' ? '喜欢' : '作品'

    const finish = (next: BatchPhase, reason: BatchStopReason, message: string | null) => {
      runningRef.current = false
      setPhase(next)
      setActiveId(null)
      setStopReason(reason)
      setStopMessage(message)
      setStatusText(null)
    }

    try {
      while (!cancelRef.current) {
        const pending = itemsRef.current.find(
          (item) => !downloadedRef.current.has(item.awemeId),
        )

        if (pending) {
          setPhase('downloading')
          setActiveId(pending.awemeId)
          setStatusText(`正在下载${kindLabel}：${pending.desc || pending.awemeId}`)

          try {
            const result = await downloadAweme({
              cookie,
              awemeId: pending.awemeId,
              playUrl: pending.playUrl,
              title: pending.desc || pending.awemeId,
              kind,
            })
            if (cancelRef.current) break

            const entry: DouyinDownloadedEntry = {
              awemeId: pending.awemeId,
              kind: folder,
              path: result.path,
              title: pending.desc || pending.awemeId,
              downloadedAt: Math.floor(Date.now() / 1000),
            }
            onDownloaded(entry)
            downloadedRef.current = new Map(downloadedRef.current).set(
              entry.awemeId,
              entry,
            )
            localSuccess += 1
            setSuccessCount(localSuccess)
          } catch (e) {
            const message = e instanceof Error ? e.message : String(e)
            const risk = looksLikeRiskControl(message)
            finish(
              'stopped',
              risk ? 'risk' : 'error',
              risk
                ? `疑似触发风控，已停止：${message}`
                : `下载失败，已停止：${message}`,
            )
            return
          }

          if (cancelRef.current) break

          const delay = randomDelayMs()
          setPhase('waiting')
          setStatusText(`间隔等待 ${(delay / 1000).toFixed(1)}s…`)
          await sleep(delay, () => cancelRef.current)
          continue
        }

        if (!hasMoreRef.current) {
          finish(
            'done',
            'complete',
            localSuccess > 0
              ? `本轮完成，成功下载 ${localSuccess} 个`
              : '当前列表已全部下载，且没有更多内容',
          )
          return
        }

        if (localLoadMore >= MAX_LOAD_MORE) {
          finish(
            'done',
            'limit',
            `已达本轮最多 ${MAX_LOAD_MORE} 次加载更多（成功 ${localSuccess} 个）。可再次点击继续下一轮。`,
          )
          return
        }

        setPhase('loadingMore')
        setActiveId(null)
        setStatusText(
          `加载更多（${localLoadMore + 1}/${MAX_LOAD_MORE}）…`,
        )

        const outcome = await loadMore()
        if (cancelRef.current) break

        if (outcome.status === 'noop' && outcome.reason === 'busy') {
          await sleep(200, () => cancelRef.current)
          continue
        }

        if (outcome.status === 'noop' && outcome.reason === 'no-more') {
          finish(
            'done',
            'complete',
            localSuccess > 0
              ? `本轮完成，成功下载 ${localSuccess} 个`
              : '没有更多内容可加载',
          )
          return
        }

        if (outcome.status === 'noop' && outcome.reason === 'missing-auth') {
          finish('stopped', 'risk', '登录状态失效，已停止批量下载')
          return
        }

        if (outcome.status === 'error') {
          const risk = looksLikeRiskControl(outcome.message)
          finish(
            'stopped',
            risk ? 'risk' : 'error',
            risk
              ? `加载列表疑似风控，已停止：${outcome.message}`
              : `加载更多失败，已停止：${outcome.message}`,
          )
          return
        }

        if (outcome.status === 'empty') {
          finish('stopped', 'risk', outcome.message)
          return
        }

        if (outcome.status !== 'ok') {
          finish('stopped', 'error', '加载更多返回未知状态，已停止')
          return
        }

        localLoadMore += 1
        setLoadMoreUsed(localLoadMore)
        hasMoreRef.current = outcome.hasMore

        // 给 React 一点时间把新行渲染出来，便于滚到下一项
        await sleep(280, () => cancelRef.current)
      }

      if (cancelRef.current) {
        finish(
          'paused',
          'user',
          `已手动停止（本轮成功 ${localSuccess} 个，加载更多 ${localLoadMore}/${MAX_LOAD_MORE}）`,
        )
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      finish('stopped', 'error', `批量下载异常中止：${message}`)
    }
  }, [cookie, kind, loadMore, onDownloaded])

  return {
    phase,
    activeId,
    isActive,
    loadMoreUsed,
    maxLoadMore: MAX_LOAD_MORE,
    successCount,
    statusText,
    stopMessage,
    stopReason,
    start,
    stop,
    clearStopBanner,
  }
}
