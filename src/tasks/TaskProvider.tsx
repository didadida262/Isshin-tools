import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { NotificationDrawer } from './NotificationDrawer'

interface TaskUiContextValue {
  drawerOpen: boolean
  setDrawerOpen: (open: boolean) => void
  toggleDrawer: () => void
}

const TaskUiContext = createContext<TaskUiContextValue | null>(null)

export function TaskProvider({ children }: { children: ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const toggleDrawer = useCallback(() => {
    setDrawerOpen((prev) => !prev)
  }, [])
  const value = useMemo(
    () => ({ drawerOpen, setDrawerOpen, toggleDrawer }),
    [drawerOpen, toggleDrawer],
  )

  return (
    <TaskUiContext.Provider value={value}>
      {children}
      <NotificationDrawer />
    </TaskUiContext.Provider>
  )
}

export function useTaskUi() {
  const ctx = useContext(TaskUiContext)
  if (!ctx) {
    throw new Error('useTaskUi must be used within TaskProvider')
  }
  return ctx
}
