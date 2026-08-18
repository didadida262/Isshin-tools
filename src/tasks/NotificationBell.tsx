import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faBell } from '@fortawesome/free-solid-svg-icons'
import { useSyncExternalStore } from 'react'
import { getActiveTaskCount, subscribeTasks } from './taskStore'
import { useTaskUi } from './TaskProvider'

export function NotificationBell() {
  const { drawerOpen, toggleDrawer } = useTaskUi()
  const activeCount = useSyncExternalStore(
    subscribeTasks,
    getActiveTaskCount,
    getActiveTaskCount,
  )

  return (
    <button
      type="button"
      onClick={toggleDrawer}
      aria-label={
        activeCount > 0 ? `任务通知，${activeCount} 个进行中` : '任务通知'
      }
      aria-expanded={drawerOpen}
      className={`relative inline-flex h-7 w-7 items-center justify-center rounded-lg text-subtle transition-colors duration-200 hover:bg-surface-hover hover:text-foreground ${
        drawerOpen ? 'bg-surface-hover text-foreground' : ''
      }`}
    >
      <FontAwesomeIcon icon={faBell} className="h-3.5 w-3.5" />
      {activeCount > 0 && (
        <span className="absolute top-0.5 right-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-danger px-0.5 text-[9px] font-semibold leading-none text-danger-fg">
          {activeCount > 9 ? '9+' : activeCount}
        </span>
      )}
    </button>
  )
}
