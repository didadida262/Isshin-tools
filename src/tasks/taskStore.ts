import {
  isActiveTaskStatus,
  type AppTask,
  type TaskStatus,
} from './types'

const TERMINAL_DISMISS_MS = 28_000

let tasks: AppTask[] = []
const listeners = new Set<() => void>()
const cancelHandlers = new Map<string, () => void>()
const dismissTimers = new Map<string, number>()

function emit() {
  listeners.forEach((listener) => listener())
}

export function subscribeTasks(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getTasks() {
  return tasks
}

export function getActiveTaskCount() {
  return tasks.filter((task) => isActiveTaskStatus(task.status)).length
}

function clearDismissTimer(id: string) {
  const timer = dismissTimers.get(id)
  if (timer != null) {
    window.clearTimeout(timer)
    dismissTimers.delete(id)
  }
}

function scheduleDismiss(id: string) {
  clearDismissTimer(id)
  const timer = window.setTimeout(() => {
    dismissTimers.delete(id)
    dismissTask(id)
  }, TERMINAL_DISMISS_MS)
  dismissTimers.set(id, timer)
}

export function upsertTask(
  input: Omit<AppTask, 'createdAt' | 'updatedAt'> & {
    createdAt?: number
  },
) {
  const now = Date.now()
  const index = tasks.findIndex((task) => task.id === input.id)
  if (index >= 0) {
    const prev = tasks[index]
    if (!prev) return
    const next = [...tasks]
    const merged = { ...input } as typeof input
    for (const key of Object.keys(merged) as (keyof typeof merged)[]) {
      if (merged[key] === undefined) delete merged[key]
    }
    next[index] = {
      ...prev,
      ...merged,
      createdAt: prev.createdAt,
      updatedAt: now,
    }
    tasks = next
  } else {
    tasks = [
      ...tasks,
      {
        ...input,
        createdAt: input.createdAt ?? now,
        updatedAt: now,
      },
    ]
  }

  if (isActiveTaskStatus(input.status)) {
    clearDismissTimer(input.id)
  } else {
    scheduleDismiss(input.id)
  }
  emit()
}

export function patchTask(id: string, patch: Partial<Omit<AppTask, 'id' | 'createdAt'>>) {
  const index = tasks.findIndex((task) => task.id === id)
  if (index < 0) return
  const prev = tasks[index]
  if (!prev) return
  const nextStatus = patch.status ?? prev.status
  const next = [...tasks]
  next[index] = {
    ...prev,
    ...patch,
    updatedAt: Date.now(),
  }
  tasks = next
  if (isActiveTaskStatus(nextStatus)) {
    clearDismissTimer(id)
  } else {
    scheduleDismiss(id)
  }
  emit()
}

export function dismissTask(id: string) {
  clearDismissTimer(id)
  cancelHandlers.delete(id)
  const next = tasks.filter((task) => task.id !== id)
  if (next.length === tasks.length) return
  tasks = next
  emit()
}

export function registerCancelHandler(id: string, handler: (() => void) | null) {
  if (!handler) {
    cancelHandlers.delete(id)
    return
  }
  cancelHandlers.set(id, handler)
}

export function cancelTask(id: string) {
  const handler = cancelHandlers.get(id)
  if (!handler) return
  handler()
  const current = tasks.find((task) => task.id === id)
  if (current && isActiveTaskStatus(current.status)) {
    patchTask(id, {
      status: current.status === 'stopping' ? current.status : 'stopping',
      detail: current.status === 'stopping' ? current.detail : '正在停止…',
    })
  }
}

export function taskStatusFromBatch(phase: string, stopReason?: string | null): TaskStatus {
  if (phase === 'waiting') return 'waiting'
  if (phase === 'stopping') return 'stopping'
  if (phase === 'done') return 'success'
  if (phase === 'paused') return 'cancelled'
  if (phase === 'stopped') {
    if (stopReason === 'user') return 'cancelled'
    return 'error'
  }
  return 'running'
}
