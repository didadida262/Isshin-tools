import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Sidebar } from './Sidebar'
import { defaultToolId, toolsRegistry } from './toolsRegistry'

export function AppShell() {
  const [activeToolId, setActiveToolId] = useState<string | null>(defaultToolId)

  const ActiveTool = useMemo(
    () => toolsRegistry.find((t) => t.id === activeToolId)?.component ?? null,
    [activeToolId],
  )

  return (
    <div className="flex h-full overflow-hidden bg-background">
      <Sidebar activeToolId={activeToolId} onSelect={setActiveToolId} />
      <main className="relative min-w-0 flex-1 overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-60"
          style={{
            background:
              'radial-gradient(ellipse 60% 40% at 20% -10%, color-mix(in srgb, var(--accent) 8%, transparent), transparent), radial-gradient(ellipse 50% 30% at 90% 0%, color-mix(in srgb, var(--border) 35%, transparent), transparent)',
          }}
        />
        <AnimatePresence mode="wait">
          {ActiveTool ? (
            <motion.div
              key={activeToolId}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              className="relative h-full"
            >
              <ActiveTool />
            </motion.div>
          ) : (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="relative flex h-full items-center justify-center px-8"
            >
              <p className="text-sm text-muted">从左侧选择一个工具开始</p>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  )
}
