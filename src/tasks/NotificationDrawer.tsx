import { createPortal } from 'react-dom'
import { useSyncExternalStore } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faCircleCheck,
  faDownload,
  faMusic,
  faSpinner,
  faStop,
  faXmark,
} from '@fortawesome/free-solid-svg-icons'
import { useTaskUi } from './TaskProvider'
import {
  cancelTask,
  dismissTask,
  getTasks,
  subscribeTasks,
} from './taskStore'
import {
  isActiveTaskStatus,
  type AppTask,
  type TaskSource,
  type TaskStatus,
} from './types'

const sourceIcon = {
  douyin: faDownload,
  netease: faMusic,
} as const satisfies Record<TaskSource, typeof faDownload>

function statusLabel(status: TaskStatus) {
  switch (status) {
    case 'running':
      return '进行中'
    case 'waiting':
      return '等待中'
    case 'stopping':
      return '正在停止'
    case 'success':
      return '已完成'
    case 'error':
      return '失败'
    case 'cancelled':
      return '已停止'
  }
}

function TaskRow({ task }: { task: AppTask }) {
  const active = isActiveTaskStatus(task.status)
  const canCancel = active && task.status !== 'stopping'

  return (
    <li className="rounded-xl border border-border-subtle bg-background/50 p-3">
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-surface text-accent">
          {task.status === 'running' || task.status === 'stopping' ? (
            <FontAwesomeIcon icon={faSpinner} className="h-3 w-3 animate-spin" />
          ) : (
            <FontAwesomeIcon icon={sourceIcon[task.source]} className="h-3 w-3" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-foreground">{task.title}</p>
              <p className="mt-0.5 truncate text-[10px] text-subtle">{task.sourceLabel}</p>
            </div>
            <span
              className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-medium ${
                task.status === 'success'
                  ? 'bg-success/15 text-success'
                  : task.status === 'error'
                    ? 'bg-danger/15 text-danger'
                    : task.status === 'cancelled'
                      ? 'bg-surface-hover text-muted'
                      : 'bg-surface-hover text-foreground'
              }`}
            >
              {statusLabel(task.status)}
            </span>
          </div>
          {task.detail && (
            <p className="mt-1.5 line-clamp-2 text-[11px] leading-relaxed text-muted">
              {task.detail}
            </p>
          )}
          {(task.itemIndex != null || (task.successCount != null && task.successCount > 0)) && (
            <p className="mt-1 text-[11px] tabular-nums text-subtle">
              {task.itemIndex != null && (
                <>
                  序号 {task.itemIndex}
                  {task.itemTotal != null ? ` / ${task.itemTotal}` : ''}
                </>
              )}
              {task.itemIndex != null &&
                task.successCount != null &&
                task.successCount > 0 &&
                ' · '}
              {task.successCount != null && task.successCount > 0 && `成功 ${task.successCount}`}
            </p>
          )}
          <div className="mt-2 flex items-center gap-2">
            {canCancel && (
              <button
                type="button"
                onClick={() => cancelTask(task.id)}
                className="inline-flex h-6 items-center gap-1 rounded-lg border border-danger/35 bg-danger/10 px-2 text-[10px] text-danger transition-colors hover:bg-danger/15"
              >
                <FontAwesomeIcon icon={faStop} className="h-2.5 w-2.5" />
                停止
              </button>
            )}
            {!active && (
              <button
                type="button"
                onClick={() => dismissTask(task.id)}
                className="inline-flex h-6 items-center rounded-lg px-2 text-[10px] text-subtle transition-colors hover:bg-surface-hover hover:text-foreground"
              >
                关闭
              </button>
            )}
          </div>
        </div>
      </div>
    </li>
  )
}

export function NotificationDrawer() {
  const { drawerOpen, setDrawerOpen } = useTaskUi()
  const tasks = useSyncExternalStore(subscribeTasks, getTasks, getTasks)
  const active = tasks.filter((task) => isActiveTaskStatus(task.status))
  const recent = tasks.filter((task) => !isActiveTaskStatus(task.status))

  if (typeof document === 'undefined') return null

  return createPortal(
    <AnimatePresence>
      {drawerOpen && (
        <motion.div
          className="fixed inset-0 z-40 flex justify-end"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
        >
          <button
            type="button"
            aria-label="关闭通知"
            className="absolute inset-0 bg-black/45"
            onClick={() => setDrawerOpen(false)}
          />
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-labelledby="task-drawer-title"
            initial={{ x: 28, opacity: 0.85 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 24, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="relative z-10 flex h-full w-[min(100%,22rem)] flex-col border-l border-border bg-surface/95 shadow-xl backdrop-blur-md"
          >
            <header className="flex shrink-0 items-start justify-between gap-3 border-b border-border-subtle px-4 py-3.5">
              <div className="min-w-0">
                <h2
                  id="task-drawer-title"
                  className="font-display text-sm font-semibold tracking-tight text-foreground"
                >
                  任务通知
                </h2>
                <p className="mt-0.5 text-[11px] text-subtle">
                  {active.length > 0
                    ? `${active.length} 个任务进行中，切换工具不会中断`
                    : '暂无进行中的下载任务'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-subtle transition-colors hover:bg-surface-hover hover:text-foreground"
                aria-label="关闭抽屉"
              >
                <FontAwesomeIcon icon={faXmark} className="h-3.5 w-3.5" />
              </button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
              {tasks.length === 0 && (
                <div className="flex h-full min-h-[12rem] flex-col items-center justify-center px-4 text-center">
                  <FontAwesomeIcon icon={faCircleCheck} className="mb-2.5 h-5 w-5 text-subtle" />
                  <p className="text-xs text-muted">没有进行中或最近完成的任务</p>
                </div>
              )}

              {active.length > 0 && (
                <section>
                  <h3 className="mb-2 text-[10px] font-medium uppercase tracking-[0.14em] text-subtle">
                    进行中
                  </h3>
                  <ul className="space-y-2">
                    {active.map((task) => (
                      <TaskRow key={task.id} task={task} />
                    ))}
                  </ul>
                </section>
              )}

              {recent.length > 0 && (
                <section className={active.length > 0 ? 'mt-5' : undefined}>
                  <h3 className="mb-2 text-[10px] font-medium uppercase tracking-[0.14em] text-subtle">
                    最近完成
                  </h3>
                  <ul className="space-y-2">
                    {recent.map((task) => (
                      <TaskRow key={task.id} task={task} />
                    ))}
                  </ul>
                </section>
              )}
            </div>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
