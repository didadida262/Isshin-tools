import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faFloppyDisk,
  faFlask,
  faSpinner,
  faXmark,
} from '@fortawesome/free-solid-svg-icons'
import { useToast } from '@/components/Toast'
import {
  agnesErrorMessage,
  generateAgnesImage,
  imageSrcFromResult,
} from './settings/agnesApi'
import { loadAgnesSettings, saveAgnesSettings } from './settings/agnesStore'
import {
  AGNES_IMAGE_MODELS,
  DEFAULT_AGNES_IMAGE_MODEL,
  isAgnesImageModelId,
  type AgnesImageModelId,
} from './settings/types'

interface SettingsDialogProps {
  open: boolean
  onClose: () => void
}

export function SettingsDialog({ open, onClose }: SettingsDialogProps) {
  const { toast } = useToast()
  const [apiKey, setApiKey] = useState('')
  const [imageModel, setImageModel] = useState<AgnesImageModelId>(
    DEFAULT_AGNES_IMAGE_MODEL,
  )
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const [promptOpen, setPromptOpen] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [testing, setTesting] = useState(false)
  const [previewSrc, setPreviewSrc] = useState<string | null>(null)
  const [testError, setTestError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (promptOpen) {
          setPromptOpen(false)
          return
        }
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose, promptOpen])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    void (async () => {
      const settings = await loadAgnesSettings()
      if (cancelled) return
      setApiKey(settings.apiKey)
      setImageModel(settings.imageModel)
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [open])

  useEffect(() => {
    if (!open) {
      setPromptOpen(false)
      setPrompt('')
      setTesting(false)
      setPreviewSrc(null)
      setTestError(null)
    }
  }, [open])

  const handleSave = async () => {
    setSaving(true)
    try {
      await saveAgnesSettings({ apiKey: apiKey.trim(), imageModel })
      toast('设置已保存', 'success')
    } catch (err) {
      toast(agnesErrorMessage(err), 'danger')
    } finally {
      setSaving(false)
    }
  }

  const openTestPrompt = () => {
    if (!apiKey.trim()) {
      toast('请先填写 Agnes API Key', 'danger')
      return
    }
    setPrompt('')
    setTestError(null)
    setPreviewSrc(null)
    setPromptOpen(true)
  }

  const runTest = async () => {
    const trimmed = prompt.trim()
    if (!trimmed) {
      toast('请输入提示词', 'danger')
      return
    }
    setTesting(true)
    setTestError(null)
    setPreviewSrc(null)
    try {
      await saveAgnesSettings({ apiKey: apiKey.trim(), imageModel })
      const result = await generateAgnesImage({
        apiKey,
        model: imageModel,
        prompt: trimmed,
      })
      const src = imageSrcFromResult(result)
      if (!src) throw new Error('未拿到可用图像')
      setPreviewSrc(src)
      toast('生成成功', 'success')
    } catch (err) {
      const msg = agnesErrorMessage(err)
      setTestError(msg)
      toast(msg, 'danger')
    } finally {
      setTesting(false)
    }
  }

  if (typeof document === 'undefined') return null

  return createPortal(
    <AnimatePresence>
      {open && (
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
            aria-labelledby="settings-dialog-title"
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="relative z-10 max-h-[min(88vh,720px)] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-surface p-5 shadow-xl"
          >
            <div className="flex items-start justify-between gap-3">
              <h2
                id="settings-dialog-title"
                className="font-display text-base font-semibold tracking-tight text-foreground"
              >
                设置
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

            <section className="mt-5 rounded-2xl border border-border-subtle bg-background/40 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-medium text-foreground">文生图</h3>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted">
                    配置 Agnes API Key，选择图像模型后可测试文生图。密钥仅保存在本机。
                  </p>
                </div>
                <a
                  href="https://www.agnes-ai.cn/zh-Hans/docs/agnes-image-25-flash"
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 text-[11px] text-accent hover:underline"
                >
                  文档
                </a>
              </div>

              {loading ? (
                <p className="mt-4 text-xs text-subtle">加载设置中…</p>
              ) : (
                <div className="mt-4 space-y-3">
                  <label className="block">
                    <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-subtle">
                      API Key
                    </span>
                    <input
                      type="password"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="sk-..."
                      autoComplete="off"
                      spellCheck={false}
                      className="mt-1.5 h-9 w-full rounded-xl border border-border bg-background px-3 text-xs text-foreground outline-none transition-colors placeholder:text-subtle focus:border-muted"
                    />
                  </label>

                  <label className="block">
                    <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-subtle">
                      图像模型
                    </span>
                    <select
                      value={imageModel}
                      onChange={(e) => {
                        const v = e.target.value
                        if (isAgnesImageModelId(v)) setImageModel(v)
                      }}
                      className="mt-1.5 h-9 w-full rounded-xl border border-border bg-background px-3 text-xs text-foreground outline-none transition-colors focus:border-muted"
                    >
                      {AGNES_IMAGE_MODELS.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className="flex flex-wrap gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => void handleSave()}
                      disabled={saving}
                      className="inline-flex h-8 items-center gap-2 rounded-xl border border-border px-3 text-xs text-muted transition-colors hover:border-muted hover:bg-surface-hover hover:text-foreground disabled:opacity-50"
                    >
                      <FontAwesomeIcon
                        icon={saving ? faSpinner : faFloppyDisk}
                        className={`h-3 w-3 ${saving ? 'animate-spin' : ''}`}
                      />
                      保存
                    </button>
                    <button
                      type="button"
                      onClick={openTestPrompt}
                      className="inline-flex h-8 items-center gap-2 rounded-xl bg-accent px-3 text-xs font-medium text-accent-fg transition-opacity hover:opacity-90"
                    >
                      <FontAwesomeIcon icon={faFlask} className="h-3 w-3" />
                      测试
                    </button>
                  </div>
                </div>
              )}
            </section>
          </motion.div>

          <AnimatePresence>
            {promptOpen && (
              <motion.div
                className="fixed inset-0 z-[60] flex items-center justify-center p-4"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.14 }}
              >
                <button
                  type="button"
                  aria-label="关闭提示词弹框"
                  className="absolute inset-0 bg-black/45"
                  onClick={() => !testing && setPromptOpen(false)}
                />
                <motion.div
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="agnes-prompt-title"
                  initial={{ opacity: 0, y: 8, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 6, scale: 0.98 }}
                  transition={{ duration: 0.16, ease: 'easeOut' }}
                  className="relative z-10 flex max-h-[min(88vh,640px)] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-border bg-surface p-5 shadow-xl"
                >
                  <div className="flex shrink-0 items-start justify-between gap-3">
                    <div>
                      <h3
                        id="agnes-prompt-title"
                        className="font-display text-sm font-semibold text-foreground"
                      >
                        输入提示词
                      </h3>
                      <p className="mt-1 text-[11px] text-muted">
                        使用 {imageModel} 生成测试图
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={testing}
                      onClick={() => setPromptOpen(false)}
                      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-subtle transition-colors hover:bg-surface-hover hover:text-foreground disabled:opacity-50"
                      aria-label="关闭"
                    >
                      <FontAwesomeIcon icon={faXmark} className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    rows={4}
                    disabled={testing}
                    placeholder="例：日出时分薄雾峡谷上方的发光浮空城市，电影级写实风格"
                    className="mt-4 w-full resize-none rounded-xl border border-border bg-background px-3 py-2.5 text-xs leading-relaxed text-foreground outline-none transition-colors placeholder:text-subtle focus:border-muted disabled:opacity-60"
                  />

                  {testError && (
                    <p className="mt-2 text-xs text-danger" role="alert">
                      {testError}
                    </p>
                  )}

                  {previewSrc && (
                    <div className="mt-3 min-h-0 flex-1 overflow-hidden rounded-xl border border-border-subtle bg-background/50">
                      <img
                        src={previewSrc}
                        alt="Agnes 生成结果"
                        className="max-h-56 w-full object-contain"
                        referrerPolicy="no-referrer"
                      />
                    </div>
                  )}

                  <div className="mt-4 flex shrink-0 justify-end gap-2">
                    <button
                      type="button"
                      disabled={testing}
                      onClick={() => setPromptOpen(false)}
                      className="inline-flex h-8 items-center rounded-xl border border-border px-3 text-xs text-muted transition-colors hover:bg-surface-hover hover:text-foreground disabled:opacity-50"
                    >
                      取消
                    </button>
                    <button
                      type="button"
                      disabled={testing}
                      onClick={() => void runTest()}
                      className="inline-flex h-8 items-center gap-2 rounded-xl bg-accent px-3 text-xs font-medium text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-60"
                    >
                      {testing && (
                        <FontAwesomeIcon
                          icon={faSpinner}
                          className="h-3 w-3 animate-spin"
                        />
                      )}
                      {testing ? '生成中…' : '确定'}
                    </button>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
