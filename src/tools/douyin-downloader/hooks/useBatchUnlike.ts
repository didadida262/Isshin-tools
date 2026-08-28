import { useCallback, useEffect, useRef, useState } from 'react'
import { unlikeAweme } from '../api/douyinApi'
import type { LoadMoreOutcome } from './useAwemeList'
import type { DouyinAweme } from '../types'

export type UnlikePhase =
  | 'idle'
  | 'unliking'
  | 'waiting'
  | 'loadingMore'
  | 'stopping'
  | 'retrying'
  | 'paused'
  | 'stopped'
  | 'done'

export type UnlikeStopReason = 'user' | 'risk' | 'error' | 'complete'

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

interface UseBatchUnlikeParams {
  /** Resets batch state when the signed-in account changes. */
  sessionKey: string
  items: DouyinAweme[]
  hasMore: boolean
  loadMore: () => Promise<LoadMoreOutcome>
  /** 取消喜欢成功后重新拉取列表（从首页），返回最新列表状态 */
  onRefreshAfterUnlike: () => Promise<{
    items: DouyinAweme[]
    hasMore: boolean
  } | null>
}

export function useBatchUnlike({
  sessionKey,
  items,
  hasMore,
  loadMore,
  onRefreshAfterUnlike,
}: UseBatchUnlikeParams) {
  const [phase, setPhase] = useState<UnlikePhase>('idle')
  const [activeId, setActiveId] = useState<string | null>(null)
  const [loadMoreUsed, setLoadMoreUsed] = useState(0)
  const [successCount, setSuccessCount] = useState(0)
  const [statusText, setStatusText] = useState<string | null>(null)
  const [stopMessage, setStopMessage] = useState<string | null>(null)
  const [stopReason, setStopReason] = useState<UnlikeStopReason | null>(null)

  const cancelRef = useRef(false)
  const runningRef = useRef(false)
  const itemsRef = useRef(items)
  const hasMoreRef = useRef(hasMore)
  const autoRetryTimerRef = useRef<number | null>(null)
  const startRef = useRef<() => Promise<void>>(async () => {})

  itemsRef.current = items
  hasMoreRef.current = hasMore

  const isActive =
    phase === 'unliking' ||
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

  const hasRemainingWork = useCallback(() => {
    return itemsRef.current.length > 0 || hasMoreRef.current
  }, [])

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
    setStatusText(null)
    setStopMessage(null)
    setStopReason(null)
  }, [sessionKey, clearAutoRetry])

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
    setStatusText('准备批量取消喜欢…')

    let localSuccess = 0
    let localLoadMore = 0

    const finish = (next: UnlikePhase, reason: UnlikeStopReason, message: string | null) => {
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

    try {
      while (!cancelRef.current) {
        const pending = itemsRef.current[0]

        if (pending) {
          setPhase('unliking')
          setActiveId(pending.awemeId)
          setStatusText(`正在取消喜欢：${pending.desc || pending.awemeId}`)

          try {
            await unlikeAweme(pending.awemeId)
            if (cancelRef.current) break
            const refreshed = await onRefreshAfterUnlike()
            if (cancelRef.current) break
            if (refreshed) {
              itemsRef.current = refreshed.items
              hasMoreRef.current = refreshed.hasMore
            } else {
              itemsRef.current = itemsRef.current.filter(
                (item) => item.awemeId !== pending.awemeId,
              )
            }
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
                : `取消喜欢失败，已停止：${message}`,
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
              ? `本轮完成，成功取消喜欢 ${localSuccess} 个`
              : '当前列表已全部取消，且没有更多内容',
          )
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
            localSuccess > 0
              ? `本轮完成，成功取消喜欢 ${localSuccess} 个`
              : '没有更多内容可加载',
          )
          return
        }

        if (outcome.status === 'noop' && outcome.reason === 'missing-auth') {
          finish('stopped', 'risk', '登录状态失效，已停止批量取消喜欢')
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
        await sleep(280, () => cancelRef.current)
      }

      if (cancelRef.current) {
        finish(
          'paused',
          'user',
          `已手动停止（本轮成功取消 ${localSuccess} 个，加载更多 ${localLoadMore} 次）`,
        )
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      finish('stopped', 'error', `批量取消喜欢异常中止：${message}`)
    }
  }, [loadMore, onRefreshAfterUnlike, clearAutoRetry, hasRemainingWork, scheduleAutoRetry])

  startRef.current = start

  return {
    phase,
    activeId,
    isActive,
    loadMoreUsed,
    successCount,
    statusText,
    stopMessage,
    stopReason,
    start,
    stop,
    clearStopBanner,
  }
}
