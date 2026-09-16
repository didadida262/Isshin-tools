import { useCallback, useEffect, useMemo, useState } from 'react'
import { Sidebar } from './Sidebar'
import { ToolVisibilityProvider } from './ToolVisibility'
import { defaultToolId, toolsRegistry } from './toolsRegistry'
import { GlobalMiniPlayer, registerPlayerNavigate } from '@/player'

export function AppShell() {
  const [activeToolId, setActiveToolId] = useState<string | null>(defaultToolId)
  const [mountedIds, setMountedIds] = useState<Set<string>>(
    () => new Set(defaultToolId ? [defaultToolId] : []),
  )

  const selectTool = useCallback((toolId: string) => {
    setMountedIds((prev) => {
      if (prev.has(toolId)) return prev
      const next = new Set(prev)
      next.add(toolId)
      return next
    })
    setActiveToolId(toolId)
  }, [])

  useEffect(() => {
    registerPlayerNavigate(selectTool)
    return () => registerPlayerNavigate(null)
  }, [selectTool])

  const mountedTools = useMemo(
    () => toolsRegistry.filter((tool) => mountedIds.has(tool.id)),
    [mountedIds],
  )

  return (
    <div className="flex h-full overflow-hidden bg-background">
      <Sidebar activeToolId={activeToolId} onSelect={selectTool} />
      <main className="relative min-w-0 flex-1 overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-60"
          style={{
            background:
              'radial-gradient(ellipse 60% 40% at 20% -10%, color-mix(in srgb, var(--accent) 8%, transparent), transparent), radial-gradient(ellipse 50% 30% at 90% 0%, color-mix(in srgb, var(--border) 35%, transparent), transparent)',
          }}
        />
        {mountedTools.length === 0 ? (
          <div className="relative flex h-full items-center justify-center px-8">
            <p className="text-sm text-muted">从左侧选择一个工具开始</p>
          </div>
        ) : (
          mountedTools.map((tool) => {
            const Tool = tool.component
            const active = tool.id === activeToolId
            return (
              <div
                key={tool.id}
                className={active ? 'relative h-full' : 'hidden'}
                aria-hidden={!active}
                inert={!active ? true : undefined}
              >
                <ToolVisibilityProvider active={active}>
                  <Tool />
                </ToolVisibilityProvider>
              </div>
            )
          })
        )}
        <GlobalMiniPlayer />
      </main>
    </div>
  )
}
