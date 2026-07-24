import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faXmark } from '@fortawesome/free-solid-svg-icons'
import type { FactorInfoContent } from '../lib/factorInfo'

interface FactorInfoDialogProps {
  open: boolean
  title: string
  content: FactorInfoContent | null
  onClose: () => void
}

export function FactorInfoDialog({ open, title, content, onClose }: FactorInfoDialogProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  if (typeof document === 'undefined') return null

  return createPortal(
    <AnimatePresence>
      {open && content && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
        >
          <button
            type="button"
            aria-label="关闭"
            className="absolute inset-0 bg-black/55"
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="factor-info-title"
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="relative z-10 w-full max-w-md rounded-2xl border border-border bg-surface p-5 shadow-xl"
          >
            <div className="flex items-start justify-between gap-3">
              <h2
                id="factor-info-title"
                className="font-display text-base font-semibold tracking-tight text-foreground"
              >
                {title}
              </h2>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-subtle transition-colors hover:bg-surface-hover hover:text-foreground"
                aria-label="关闭弹框"
              >
                <FontAwesomeIcon icon={faXmark} className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <section>
                <h3 className="text-[11px] font-medium uppercase tracking-[0.12em] text-subtle">
                  名词解释
                </h3>
                <p className="mt-1.5 text-xs leading-relaxed text-muted">{content.definition}</p>
              </section>
              <section>
                <h3 className="text-[11px] font-medium uppercase tracking-[0.12em] text-subtle">
                  对黄金的影响
                </h3>
                <p className="mt-1.5 text-xs leading-relaxed text-muted">{content.goldImpact}</p>
              </section>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
