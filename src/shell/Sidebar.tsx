import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { motion } from 'framer-motion'
import logoIsshin from '@/assets/logo_isshin_agent.png'
import { NotificationBell } from '@/tasks'
import { toolsRegistry, type ToolDefinition } from './toolsRegistry'

interface SidebarProps {
  activeToolId: string | null
  onSelect: (toolId: string) => void
}

export function Sidebar({ activeToolId, onSelect }: SidebarProps) {
  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-border-subtle bg-surface/80 backdrop-blur-md">
      <div className="flex items-center gap-3 border-b border-border-subtle px-3 py-4">
        <img
          src={logoIsshin}
          alt="Isshin"
          className="h-14 w-14 shrink-0 rounded-xl object-cover ring-1 ring-border/50"
        />
        <div className="min-w-0">
          <p className="font-display text-base font-semibold leading-tight tracking-tight text-foreground">
            Isshin Tools
          </p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-3" aria-label="工具列表">
        <p className="px-2 pb-2 text-[10px] font-medium uppercase tracking-[0.14em] text-subtle">
          Tools
        </p>
        {toolsRegistry.map((tool) => (
          <ToolNavItem
            key={tool.id}
            tool={tool}
            active={tool.id === activeToolId}
            onSelect={() => onSelect(tool.id)}
          />
        ))}
      </nav>

      <div className="flex items-center justify-between gap-2 border-t border-border-subtle px-4 py-3">
        <p className="text-[11px] text-subtle">
          v{__APP_VERSION__} · {toolsRegistry.length} tools
        </p>
        <NotificationBell />
      </div>
    </aside>
  )
}

function ToolNavItem({
  tool,
  active,
  onSelect,
}: {
  tool: ToolDefinition
  active: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={active ? 'page' : undefined}
      className={`relative flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-all duration-200 ease-in-out ${
        active
          ? 'bg-surface-hover text-foreground shadow-sm'
          : 'text-muted hover:bg-surface-hover/60 hover:text-foreground'
      }`}
    >
      {active && (
        <motion.span
          layoutId="sidebar-active"
          className="absolute inset-0 rounded-xl border border-border/60"
          transition={{ type: 'spring', stiffness: 380, damping: 32 }}
        />
      )}
      <span className="relative mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-background/80 text-accent">
        <FontAwesomeIcon icon={tool.icon} className="h-3.5 w-3.5" />
      </span>
      <span className="relative min-w-0">
        <span className="block truncate text-sm font-medium">{tool.name}</span>
        <span className="mt-0.5 block truncate text-[11px] text-subtle">
          {tool.description}
        </span>
      </span>
    </button>
  )
}
