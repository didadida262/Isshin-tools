import { useEffect } from 'react'
import { useToolVisible } from './ToolVisibility'

const DEFAULT_INTERVAL_MS = 3000

/** Re-run `reload` when this tool is shown, the window is focused, or on a short interval. */
export function useResyncWhenVisible(
  reload: () => void | Promise<void>,
  intervalMs = DEFAULT_INTERVAL_MS,
) {
  const visible = useToolVisible()

  useEffect(() => {
    if (!visible) return

    void reload()

    const onFocus = () => {
      void reload()
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void reload()
    }

    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibility)
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void reload()
    }, intervalMs)

    return () => {
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibility)
      window.clearInterval(timer)
    }
  }, [visible, reload, intervalMs])
}
