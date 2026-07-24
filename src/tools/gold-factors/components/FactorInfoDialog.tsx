import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faXmark } from '@fortawesome/free-solid-svg-icons'
import type { FactorInfoContent } from '../lib/factorInfo'
import {
  fetchTopGoldReserves,
  type GoldReserveRow,
} from '../lib/goldReserves'

interface FactorInfoDialogProps {
  open: boolean
  title: string
  factorId: string
  content: FactorInfoContent | null
  onClose: () => void
}

export function FactorInfoDialog({
  open,
  title,
  factorId,
  content,
  onClose,
}: FactorInfoDialogProps) {
  const showReserves = factorId === 'cb-gold'
  const [rows, setRows] = useState<GoldReserveRow[] | null>(null)
  const [source, setSource] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  useEffect(() => {
    if (!open || !showReserves) return
    let cancelled = false
    setLoading(true)
    setError(null)
    void (async () => {
      try {
        const result = await fetchTopGoldReserves()
        if (cancelled) return
        setRows(result.rows)
        setSource(result.source)
      } catch (e) {
        if (cancelled) return
        setRows(null)
        setError(e instanceof Error ? e.message : '储备排名加载失败')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, showReserves])

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
            className="relative z-10 max-h-[min(88vh,720px)] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-surface p-5 shadow-xl"
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

              {showReserves && (
                <section>
                  <h3 className="text-[11px] font-medium uppercase tracking-[0.12em] text-subtle">
                    全球官方黄金储备 Top 10
                  </h3>
                  <p className="mt-1 text-[10px] text-subtle">
                    当前可获取的最新官方披露（非交易日内实时）。
                    {source ? ` 来源：${source}` : ''}
                  </p>

                  {loading && (
                    <p className="mt-3 text-xs text-muted" role="status">
                      加载排名中…
                    </p>
                  )}
                  {error && !loading && (
                    <p className="mt-3 text-xs text-danger" role="alert">
                      {error}
                    </p>
                  )}
                  {rows && !loading && (
                    <div className="mt-3 overflow-hidden rounded-xl border border-border-subtle">
                      <table className="w-full text-left text-[11px]">
                        <thead className="bg-background/60 text-subtle">
                          <tr>
                            <th className="px-3 py-2 font-medium">#</th>
                            <th className="px-3 py-2 font-medium">国家 / 地区</th>
                            <th className="px-3 py-2 text-right font-medium">储备量</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((row) => (
                            <tr
                              key={row.countryEn}
                              className="border-t border-border-subtle text-foreground"
                            >
                              <td className="px-3 py-2 tabular-nums text-subtle">{row.rank}</td>
                              <td className="px-3 py-2">
                                <span>{row.country}</span>
                                {row.country !== row.countryEn && (
                                  <span className="ml-1.5 text-subtle">{row.countryEn}</span>
                                )}
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums">
                                {row.tonnes.toLocaleString('en-US')} t
                                <div className="text-[10px] text-subtle">{row.asOf}</div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
