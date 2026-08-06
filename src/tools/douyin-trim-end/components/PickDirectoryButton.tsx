import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faFolderOpen } from '@fortawesome/free-solid-svg-icons'
import { motion } from 'framer-motion'

interface Props {
  onPick: () => void
  disabled?: boolean
}

export function PickDirectoryButton({ onPick, disabled }: Props) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6">
      <motion.button
        type="button"
        onClick={onPick}
        disabled={disabled}
        whileHover={disabled ? undefined : { scale: 1.02 }}
        whileTap={disabled ? undefined : { scale: 0.985 }}
        className="group relative flex min-h-44 w-full max-w-md flex-col items-center justify-center gap-4 rounded-3xl border border-border bg-surface/70 px-8 py-10 text-center shadow-lg shadow-black/20 backdrop-blur-md transition-colors hover:border-accent/40 hover:bg-surface disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-background/80 text-accent ring-1 ring-border/60 transition-transform duration-300 group-hover:scale-105">
          <FontAwesomeIcon icon={faFolderOpen} className="h-7 w-7" />
        </span>
        <span>
          <span className="block font-display text-lg font-semibold tracking-tight text-foreground">
            选择视频目录
          </span>
          <span className="mt-2 block text-xs leading-relaxed text-muted">
            仅处理本级目录中的视频 · 默认切除末尾 3 秒
          </span>
        </span>
      </motion.button>
    </div>
  )
}
