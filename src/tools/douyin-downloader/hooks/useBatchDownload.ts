import { useCallback, useEffect, useRef, useState } from 'react'
import {
  dismissTask,
  registerCancelHandler,
  TASK_IDS,
  taskStatusFromBatch,
  upsertTask,
} from '@/tasks'
import { downloadAweme } from '../api/douyinApi'
import { awemeSeq } from '../lib/awemeOrder'
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
  | 'retrying'
  | 'paused'
  | 'stopped'
  | 'done'

export type BatchStopReason = 'user' | 'risk' | 'error' | 'complete'

const DELAY_MIN_MS = 1000
const DELAY_MAX_MS = 3_000

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

/**
 * 视频源永久失效（已删除 / 转为私密）：批量时应跳过，勿整批停住重试。
 *
 * 优先认后端的 MEDIA_GONE 标记；正文里的「视频源已不可用」是同一路径写出的
 * 中文标记，用作剥前缀后的兜底。登录/签名失败时后端不会打这两处，会走风控分支。
 */
function looksLikeItemUnavailable(message: string) {
  const text = message.toLowerCase()
  return text.includes('media_gone') || message.includes('视频源已不可用')
}

/**
 * 连续这么多条都「不可用」就不再当成个别死链。
 *
 * 真正失效的视频在列表里是零散分布的；连片失败更像是被限流，
 * 此时继续跳下去会把整个列表刷成「已跳过」。
 */
const MAX_CONSECUTIVE_SKIPS = 8

function humanMessage(message: string) {
  return message.replace(/^MEDIA_GONE\s*·\s*/i, '')
}

interface UseBatchDownloadParams {
  /** Resets batch state when the signed-in account changes. */
  sessionKey: string
  kind: DouyinListKind
  items: DouyinAweme[]
  hasMore: boolean
  downloadedById: Map<string, DouyinDownloadedEntry>
  loadMore: () => Promise<LoadMoreOutcome>
  onDownloaded: (entry: DouyinDownloadedEntry) => void
}

export function useBatchDownload({
  sessionKey,
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
  const [skipCount, setSkipCount] = useState(0)
  /** awemeId → 跳过原因，会话内保留，避免批量反复撞同一失效资源 */
  const [skippedById, setSkippedById] = useState<Map<string, string>>(
    () => new Map(),
  )
  const [statusText, setStatusText] = useState<string | null>(null)
  const [stopMessage, setStopMessage] = useState<string | null>(null)
  const [stopReason, setStopReason] = useState<BatchStopReason | null>(null)

  const cancelRef = useRef(false)
  const runningRef = useRef(false)
  const itemsRef = useRef(items)
  const hasMoreRef = useRef(hasMore)
  const downloadedRef = useRef(downloadedById)
  const skippedRef = useRef(skippedById)
  const autoRetryTimerRef = useRef<number | null>(null)
  const startRef = useRef<() => Promise<void>>(async () => {})

  itemsRef.current = items
  hasMoreRef.current = hasMore
  downloadedRef.current = downloadedById
  skippedRef.current = skippedById

  const isActive =
    phase === 'downloading' ||
    phase === 'waiting' ||
    phase === 'loadingMore' ||
    phase === 'stopping' ||
    phase === 'retrying'

  const clearAutoRetry = useCallback(() => {
    if (autoRetryTimerRef.current != null) {
      window.clearTimeout(autoRetryTimerRef.current)
      autoRetryTimerRef.current = null
    }
  }, [])

  const isPendingItem = useCallback((awemeId: string) => {
    return (
      !downloadedRef.current.has(awemeId) && !skippedRef.current.has(awemeId)
    )
  }, [])

  const hasRemainingWork = useCallback(() => {
    const pending = itemsRef.current.some((item) => isPendingItem(item.awemeId))
    return pending || hasMoreRef.current
  }, [isPendingItem])

  const scheduleAutoRetry = useCallback(() => {
    if (!hasRemainingWork()) return

    clearAutoRetry()
    const delay = randomDelayMs()
    setPhase('retrying')
    setStatusText(`将在 ${(delay / 1000).toFixed(1)}s 后自动重试…`)

    autoRetryTimerRef.current = window.setTimeout(() => {
      autoRetryTimerRef.current = null
      void startRef.current()
    }, delay)
  }, [clearAutoRetry, hasRemainingWork])

  useEffect(() => {
    cancelRef.current = true
    runningRef.current = false
    clearAutoRetry()
    setPhase('idle')
    setActiveId(null)
    setLoadMoreUsed(0)
    setSuccessCount(0)
    setSkipCount(0)
    setSkippedById(new Map())
    setStatusText(null)
    setStopMessage(null)
    setStopReason(null)
    dismissTask(TASK_IDS.douyinBatch)
    registerCancelHandler(TASK_IDS.douyinBatch, null)
  }, [kind, sessionKey, clearAutoRetry])

  useEffect(() => () => clearAutoRetry(), [clearAutoRetry])

  const stop = useCallback(() => {
    if (autoRetryTimerRef.current != null || phase === 'retrying') {
      clearAutoRetry()
      runningRef.current = false
      setPhase('paused')
      setActiveId(null)
      setStopReason('user')
      setStopMessage('已取消自动重试')
      setStatusText(null)
      return
    }
    if (!runningRef.current) return
    cancelRef.current = true
    setPhase('stopping')
    setStatusText('正在停止…')
  }, [clearAutoRetry, phase])

  useEffect(() => {
    if (phase === 'idle' && !stopMessage) {
      dismissTask(TASK_IDS.douyinBatch)
      registerCancelHandler(TASK_IDS.douyinBatch, null)
      return
    }

    const kindLabel = kind === 'favorite' ? '喜欢' : '作品'
    const found = activeId ? items.findIndex((item) => item.awemeId === activeId) : -1
    upsertTask({
      id: TASK_IDS.douyinBatch,
      source: 'douyin',
      sourceLabel: '抖音下载器',
      title: `批量下载${kindLabel}`,
      detail: statusText ?? stopMessage ?? '准备中…',
      status: taskStatusFromBatch(phase, stopReason),
      successCount,
      itemIndex: found >= 0 ? found + 1 : undefined,
      itemTotal: items.length > 0 ? items.length : undefined,
    })
    registerCancelHandler(TASK_IDS.douyinBatch, isActive ? stop : null)
  }, [
    phase,
    statusText,
    stopMessage,
    stopReason,
    successCount,
    kind,
    isActive,
    stop,
    activeId,
    items,
  ])

  const clearStopBanner = useCallback(() => {
    clearAutoRetry()
    setStopMessage(null)
    setStopReason(null)
    if (
      phase === 'stopped' ||
      phase === 'done' ||
      phase === 'paused' ||
      phase === 'retrying'
    ) {
      setPhase('idle')
      setActiveId(null)
      setStatusText(null)
    }
  }, [clearAutoRetry, phase])

  const start = useCallback(async () => {
    if (runningRef.current) return
    clearAutoRetry()
    runningRef.current = true
    cancelRef.current = false
    setStopMessage(null)
    setStopReason(null)
    setSuccessCount(0)
    setLoadMoreUsed(0)
    setStatusText('准备批量下载…')

    let localSuccess = 0
    let localSkip = 0
    let localLoadMore = 0
    let consecutiveSkips = 0
    const folder = kind === 'favorite' ? 'likes' : 'works'
    const kindLabel = kind === 'favorite' ? '喜欢' : '作品'

    const finish = (next: BatchPhase, reason: BatchStopReason, message: string | null) => {
      runningRef.current = false
      setActiveId(null)
      setStopReason(reason)
      setStopMessage(message)

      const shouldAutoRetry =
        next === 'stopped' &&
        (reason === 'risk' || reason === 'error') &&
        hasRemainingWork()

      if (shouldAutoRetry) {
        scheduleAutoRetry()
        return
      }

      setPhase(next)
      setStatusText(null)
    }

    const completeMessage = () => {
      const parts: string[] = []
      if (localSuccess > 0) parts.push(`成功下载 ${localSuccess} 个`)
      if (localSkip > 0) parts.push(`跳过 ${localSkip} 个（视频源不可用）`)
      if (parts.length === 0) {
        return skippedRef.current.size > 0
          ? '当前列表已全部处理（含已跳过），且没有更多内容'
          : '当前列表已全部下载，且没有更多内容'
      }
      return `本轮完成，${parts.join('，')}`
    }

    try {
      while (!cancelRef.current) {
        const pending = itemsRef.current.find((item) => isPendingItem(item.awemeId))

        if (pending) {
          setPhase('downloading')
          setActiveId(pending.awemeId)
          setStatusText(`正在下载${kindLabel}：${pending.desc || pending.awemeId}`)

          try {
            const order = hasMoreRef.current
              ? undefined
              : awemeSeq(itemsRef.current, pending.awemeId)
            const result = await downloadAweme({
              awemeId: pending.awemeId,
              playUrl: pending.playUrl,
              playUrls: pending.playUrlCandidates,
              title: pending.desc || pending.awemeId,
              kind,
              seq: order?.seq,
              total: order?.total,
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
            consecutiveSkips = 0
            setSuccessCount(localSuccess)
          } catch (e) {
            const raw = e instanceof Error ? e.message : String(e)
            const message = humanMessage(raw)
            // 必须用 raw 判断：humanMessage 会剥掉 MEDIA_GONE 前缀；
            // 剥完后正文里的「cookie」会误撞 looksLikeRiskControl。
            if (looksLikeItemUnavailable(raw)) {
              const nextSkipped = new Map(skippedRef.current).set(
                pending.awemeId,
                message,
              )
              skippedRef.current = nextSkipped
              setSkippedById(nextSkipped)
              localSkip += 1
              consecutiveSkips += 1
              setSkipCount(nextSkipped.size)

              if (consecutiveSkips >= MAX_CONSECUTIVE_SKIPS) {
                finish(
                  'stopped',
                  'risk',
                  `连续 ${consecutiveSkips} 条视频源都不可用，疑似被限流而非视频失效，已停止：${message}`,
                )
                return
              }

              if (cancelRef.current) break
              const delay = randomDelayMs()
              setPhase('waiting')
              setStatusText(
                `视频源不可用已跳过，间隔等待 ${(delay / 1000).toFixed(1)}s…`,
              )
              await sleep(delay, () => cancelRef.current)
              continue
            }
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
          finish('done', 'complete', completeMessage())
          return
        }

        const delay = randomDelayMs()
        setPhase('waiting')
        setActiveId(null)
        setStatusText(`加载更多前等待 ${(delay / 1000).toFixed(1)}s…`)
        await sleep(delay, () => cancelRef.current)
        if (cancelRef.current) break

        setPhase('loadingMore')
        setStatusText(`加载更多（第 ${localLoadMore + 1} 次）…`)

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
            localSuccess > 0 || localSkip > 0
              ? completeMessage()
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
          `已手动停止（本轮成功 ${localSuccess} 个${
            localSkip > 0 ? `，跳过 ${localSkip} 个` : ''
          }，加载更多 ${localLoadMore} 次）`,
        )
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      finish('stopped', 'error', `批量下载异常中止：${message}`)
    }
  }, [
    kind,
    loadMore,
    onDownloaded,
    clearAutoRetry,
    hasRemainingWork,
    scheduleAutoRetry,
    isPendingItem,
  ])

  startRef.current = start

  return {
    phase,
    activeId,
    isActive,
    loadMoreUsed,
    successCount,
    skipCount,
    skippedById,
    statusText,
    stopMessage,
    stopReason,
    start,
    stop,
    clearStopBanner,
  }
}
