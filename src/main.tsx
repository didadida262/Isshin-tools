import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ThemeProvider } from '@/theme/ThemeProvider'
import { ToastProvider } from '@/components/Toast'
import { TaskProvider } from '@/tasks'
import App from './App'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <ToastProvider>
        <TaskProvider>
          <App />
        </TaskProvider>
      </ToastProvider>
    </ThemeProvider>
  </StrictMode>,
)
