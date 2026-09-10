import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ThemeProvider } from '@/theme/ThemeProvider'
import { ToastProvider, useToast } from '@/components/Toast'
import { TaskProvider } from '@/tasks'
import { listen } from '@tauri-apps/api/event'
import App from './App'
import { ScreenshotOverlay } from '@/tools/screenshot/ScreenshotOverlay'
import './index.css'

function isScreenshotRoute(): boolean {
  if (typeof window === 'undefined') return false
  if (window.location.hash.includes('/screenshot')) return true
  try {
    // Sync label check via injected global when available
    const w = window as Window & { __TAURI_INTERNALS__?: unknown }
    if (!w.__TAURI_INTERNALS__) return false
  } catch {
    return false
  }
  return false
}

async function resolveScreenshotMode(): Promise<boolean> {
  if (window.location.hash.includes('/screenshot')) return true
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    return getCurrentWindow().label === 'screenshot-overlay'
  } catch {
    return false
  }
}

function ScreenshotCopiedListener() {
  const { toast } = useToast()
  useEffect(() => {
    let cancelled = false
    const unsubs: Array<() => void> = []

    const track = (unlisten: () => void) => {
      if (cancelled) {
        unlisten()
        return
      }
      unsubs.push(unlisten)
    }

    void listen('screenshot-copied', () => {
      toast('截图已复制，可 ⌘V 粘贴', 'success')
    }).then(track)

    void listen<string>('screenshot-error', (e) => {
      toast(e.payload || '截屏失败', 'danger')
    }).then(track)

    return () => {
      cancelled = true
      for (const unlisten of unsubs) unlisten()
    }
  }, [toast])
  return null
}

function Root() {
  const [mode, setMode] = useState<'pending' | 'app' | 'screenshot'>(() =>
    isScreenshotRoute() ? 'screenshot' : 'pending',
  )

  useEffect(() => {
    if (mode === 'screenshot') return
    void resolveScreenshotMode().then((isShot) => {
      setMode(isShot ? 'screenshot' : 'app')
    })
  }, [mode])

  if (mode === 'pending') {
    return null
  }

  if (mode === 'screenshot') {
    return <ScreenshotOverlay />
  }

  return (
    <ThemeProvider>
      <ToastProvider>
        <TaskProvider>
          <ScreenshotCopiedListener />
          <App />
        </TaskProvider>
      </ToastProvider>
    </ThemeProvider>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
