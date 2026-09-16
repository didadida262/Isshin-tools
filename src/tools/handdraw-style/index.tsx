import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCheck, faCopy, faPenNib, faXmark } from '@fortawesome/free-solid-svg-icons'
import { useToast } from '@/components/Toast'
import { CONTACT_SHEETS, sheetContains, sheetSrc, type ContactSheet } from './data/sheets'
import { HANDDRAW_STYLES } from './data/styles'
import { buildPrompts, findStyle } from './lib/prompt'

interface PromptResult {
  number: string
  generationName: string
  reference: string
  traits: string
  zh: string
  en: string
}

export function HanddrawStyleTool() {
  const { toast } = useToast()
  const [numberInput, setNumberInput] = useState('')
  const [theme, setTheme] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<PromptResult | null>(null)
  const [preview, setPreview] = useState<ContactSheet | null>(null)

  const matched = useMemo(() => findStyle(numberInput), [numberInput])
  const maxNum = HANDDRAW_STYLES.length.toString().padStart(3, '0')

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    const style = findStyle(numberInput)
    const trimmedTheme = theme.trim()
    if (!style) {
      setError(`请输入 001–${maxNum} 之间的风格编号`)
      setResult(null)
      toast(`请输入有效编号（001–${maxNum}）`, 'danger')
      return
    }
    if (!trimmedTheme) {
      setError('请填写主题，例如：一只狗')
      setResult(null)
      toast('请填写主题', 'danger')
      return
    }
    const prompts = buildPrompts(style, trimmedTheme)
    setError(null)
    setResult({
      number: style.number,
      generationName: style.generationName,
      reference: style.reference,
      traits: style.traits,
      ...prompts,
    })
  }

  return (
    <div className="flex h-full flex-col gap-5 overflow-hidden p-5 md:p-6">
      <header className="shrink-0">
        <h1 className="font-display text-xl font-semibold tracking-tight text-foreground">
          手绘风格提示词
        </h1>
        <p className="mt-1 text-xs text-muted">
          从下方拼图挑编号，填入主题后生成可复制的中英生图提示词 · 共 {HANDDRAW_STYLES.length} 种风格
        </p>
      </header>

      <form onSubmit={handleSubmit} className="shrink-0">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            value={numberInput}
            onChange={(e) => setNumberInput(e.target.value)}
            placeholder="编号 016"
            aria-label="风格编号"
            inputMode="numeric"
            className="h-8 w-full rounded-xl border border-border bg-background px-3 text-xs text-foreground outline-none transition-colors placeholder:text-subtle focus:border-muted sm:w-24"
          />
          <input
            value={theme}
            onChange={(e) => setTheme(e.target.value)}
            placeholder="主题，例如：一只狗"
            aria-label="画面主题"
            className="h-8 min-w-0 flex-1 rounded-xl border border-border bg-background px-3 text-xs text-foreground outline-none transition-colors placeholder:text-subtle focus:border-muted"
          />
          <button
            type="submit"
            className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-border bg-surface px-3 text-[11px] font-medium text-foreground transition-colors hover:border-muted hover:bg-surface-hover"
          >
            <FontAwesomeIcon icon={faPenNib} className="h-3 w-3" />
            生成提示词
          </button>
        </div>
        {matched && (
          <p className="mt-2 text-xs text-muted">
            #{matched.number} · {matched.generationName}
            <span className="mx-1 text-subtle">·</span>
            {matched.reference}
          </p>
        )}
        {error && (
          <p className="mt-2 text-xs text-danger" role="alert">
            {error}
          </p>
        )}
      </form>

      {result && (
        <section className="grid shrink-0 gap-3 md:grid-cols-2">
          <PromptBlock label="中文提示词" text={result.zh} />
          <PromptBlock label="English prompt" text={result.en} />
          {result.traits ? (
            <p className="line-clamp-2 rounded-2xl border border-border-subtle bg-surface/40 px-4 py-2.5 text-[11px] leading-relaxed text-subtle md:col-span-2">
              风格特征不写入默认提示词，需要时自行补充：{result.traits}
            </p>
          ) : null}
        </section>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto pb-2">
        <h2 className="mb-3 text-sm font-medium text-foreground">风格拼图</h2>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {CONTACT_SHEETS.map((sheet) => {
            const active = result ? sheetContains(sheet, result.number) : false
            return (
              <figure
                key={sheet.file}
                className={`overflow-hidden rounded-2xl border bg-surface/50 p-2.5 transition-colors ${
                  active ? 'border-muted' : 'border-border-subtle'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setPreview(sheet)}
                  className="block w-full cursor-zoom-in overflow-hidden rounded-xl"
                  aria-label={`放大查看 ${sheet.group} #${sheet.start} 到 #${sheet.end}`}
                >
                  <img
                    src={sheetSrc(sheet.file)}
                    alt={`${sheet.group} #${sheet.start}–#${sheet.end}`}
                    className="block w-full rounded-xl"
                    loading="lazy"
                  />
                </button>
                <figcaption className="px-1 pt-2 text-xs font-medium text-foreground">
                  {sheet.group} · #{sheet.start}–#{sheet.end}
                  <span className="ml-2 font-normal text-subtle">{sheet.title}</span>
                </figcaption>
              </figure>
            )
          })}
        </div>
      </div>

      <SheetPreview sheet={preview} onClose={() => setPreview(null)} />
    </div>
  )
}

function PromptBlock({ label, text }: { label: string; text: string }) {
  const { toast } = useToast()
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      toast('已复制提示词', 'success')
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      toast('复制失败', 'danger')
    }
  }

  return (
    <div className="rounded-2xl border border-border-subtle bg-surface/50 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-subtle">{label}</p>
        <button
          type="button"
          onClick={() => void copy()}
          className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-border bg-background px-2.5 text-[11px] text-foreground transition-colors hover:border-muted hover:bg-surface-hover"
        >
          <FontAwesomeIcon icon={copied ? faCheck : faCopy} className="h-3 w-3" />
          {copied ? '已复制' : '复制'}
        </button>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-foreground">{text}</p>
    </div>
  )
}

function SheetPreview({
  sheet,
  onClose,
}: {
  sheet: ContactSheet | null
  onClose: () => void
}) {
  useEffect(() => {
    if (!sheet) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sheet, onClose])

  if (typeof document === 'undefined') return null

  return createPortal(
    <AnimatePresence>
      {sheet && (
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
            className="absolute inset-0 bg-black/70"
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={`${sheet.group} #${sheet.start}–#${sheet.end}`}
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="relative z-10 max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-2xl border border-border bg-surface p-3 shadow-xl"
          >
            <div className="mb-2 flex items-center justify-between gap-3 px-1">
              <p className="text-sm font-medium text-foreground">
                {sheet.group} · #{sheet.start}–#{sheet.end}
                <span className="ml-2 font-normal text-subtle">{sheet.title}</span>
              </p>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-subtle transition-colors hover:bg-surface-hover hover:text-foreground"
                aria-label="关闭放大预览"
              >
                <FontAwesomeIcon icon={faXmark} className="h-3.5 w-3.5" />
              </button>
            </div>
            <img
              src={sheetSrc(sheet.file)}
              alt={`${sheet.group} #${sheet.start}–#${sheet.end}`}
              className="max-h-[78vh] w-full rounded-xl object-contain"
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

export default HanddrawStyleTool
