import { useCallback, useRef, useState } from 'react'
import { open } from '@tauri-apps/plugin-dialog'
import { revealItemInDir } from '@tauri-apps/plugin-opener'
import { scanVideoDir, trimVideoEnd } from '../api/trimApi'
import {
  DEFAULT_TRIM_SECONDS,
  type TrimQueueItem,
  type VideoEntry,
} from '../types'

type Phase = 'idle' | 'ready' | 'running' | 'done'

export function useBatchTrim() {
  const [phase, setPhase] = useState<Phase>('idle')
  const [dir, setDir] = useState<string | null>(null)
  const [trimSeconds, setTrimSeconds] = useState(DEFAULT_TRIM_SECONDS)
  const [items, setItems] = useState<TrimQueueItem[]>([])
  const [error, setError] = useState<string | null>(null)
  const cancelRef = useRef(false)

  const reset = useCallback(() => {
    cancelRef.current = true
    setPhase('idle')
    setDir(null)
    setItems([])
    setError(null)
    setTrimSeconds(DEFAULT_TRIM_SECONDS)
  }, [])

  const pickDirectory = useCallback(async () => {
    setError(null)
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: '选择抖音视频所在目录',
      })
      if (!selected || Array.isArray(selected)) return

      const videos = await scanVideoDir(selected)
      if (videos.length === 0) {
        setError('该目录下没有找到视频文件（mp4 / mov / m4v / webm / mkv）')
        setDir(selected)
        setItems([])
        setPhase('ready')
        return
      }

      setDir(selected)
      setItems(videos.map((entry: VideoEntry) => ({ entry, status: 'pending' })))
      setPhase('ready')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  const start = useCallback(async () => {
    if (items.length === 0 || phase === 'running') return
    cancelRef.current = false
    setPhase('running')
    setError(null)

    const queue = items.map((item) => item.entry)
    setItems(queue.map((entry) => ({ entry, status: 'pending' })))

    const seconds = trimSeconds
    for (let i = 0; i < queue.length; i++) {
      const entry = queue[i]
      if (!entry || cancelRef.current) break

      setItems((prev) =>
        prev.map((item, idx) =>
          idx === i ? { ...item, status: 'running' } : item,
        ),
      )

      try {
        const result = await trimVideoEnd(entry.path, seconds)
        setItems((prev) =>
          prev.map((item, idx) =>
            idx === i
              ? {
                  ...item,
                  status: result.ok ? 'done' : 'error',
                  result,
                }
              : item,
          ),
        )
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        setItems((prev) =>
          prev.map((item, idx) =>
            idx === i
              ? {
                  ...item,
                  status: 'error',
                  result: {
                    path: item.entry.path,
                    name: item.entry.name,
                    outputPath: null,
                    ok: false,
                    error: message,
                    durationBefore: null,
                    durationAfter: null,
                  },
                }
              : item,
          ),
        )
      }
    }

    setPhase('done')
  }, [items, phase, trimSeconds])

  const stop = useCallback(() => {
    cancelRef.current = true
  }, [])

  const openOutputFolder = useCallback(async () => {
    const firstOk = items.find((i) => i.result?.ok && i.result.outputPath)
    if (firstOk?.result?.outputPath) {
      await revealItemInDir(firstOk.result.outputPath)
      return
    }
    if (dir) {
      await revealItemInDir(dir)
    }
  }, [dir, items])

  const successCount = items.filter((i) => i.status === 'done').length
  const failCount = items.filter((i) => i.status === 'error').length
  const doneCount = successCount + failCount

  return {
    phase,
    dir,
    trimSeconds,
    setTrimSeconds,
    items,
    error,
    successCount,
    failCount,
    doneCount,
    pickDirectory,
    start,
    stop,
    reset,
    openOutputFolder,
  }
}
