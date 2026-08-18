import { useMemo, useState, type ReactNode } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faQrcode,
  faKey,
  faRightFromBracket,
  faSpinner,
} from '@fortawesome/free-solid-svg-icons'
import type { AuthStatus, DouyinProfile, DouyinQrSession } from '../types'

const COOKIE_FIELDS = [
  { key: 'sessionid', label: 'sessionid', required: true, recommended: false },
  { key: 'sessionid_ss', label: 'sessionid_ss', required: false, recommended: false },
  { key: 'ttwid', label: 'ttwid', required: false, recommended: false },
  { key: 'msToken', label: 'msToken', required: false, recommended: false },
  { key: 'UIFID', label: 'UIFID', required: false, recommended: true },
  { key: 's_v_web_id', label: 's_v_web_id', required: false, recommended: false },
] as const

type CookieFieldKey = (typeof COOKIE_FIELDS)[number]['key']

function emptyCookieValues(): Record<CookieFieldKey, string> {
  return Object.fromEntries(COOKIE_FIELDS.map((f) => [f.key, ''])) as Record<
    CookieFieldKey,
    string
  >
}

function looksLikeFullCookie(text: string) {
  return text.includes(';') && /sessionid\s*=/i.test(text)
}

function parseCookieString(raw: string): Partial<Record<CookieFieldKey, string>> {
  const out: Partial<Record<CookieFieldKey, string>> = {}
  for (const part of raw.split(';')) {
    const idx = part.indexOf('=')
    if (idx < 0) continue
    const name = part.slice(0, idx).trim()
    const value = part.slice(idx + 1).trim()
    const field = COOKIE_FIELDS.find((f) => f.key.toLowerCase() === name.toLowerCase())
    if (field && value) out[field.key] = value
  }
  return out
}

function upsertCookiePair(raw: string, key: string, value: string) {
  const parts = raw
    .split(';')
    .map((p) => p.trim())
    .filter(Boolean)
  const idx = parts.findIndex((p) => p.split('=')[0]?.trim().toLowerCase() === key.toLowerCase())
  if (idx >= 0) {
    if (value.trim()) parts[idx] = `${key}=${value.trim()}`
    else parts.splice(idx, 1)
  } else if (value.trim()) {
    parts.push(`${key}=${value.trim()}`)
  }
  return parts.join('; ')
}

interface LoginPanelProps {
  status: AuthStatus
  profile: DouyinProfile | null
  error: string | null
  qrSession: DouyinQrSession | null
  onStartQr: () => void
  onCookieLogin: (cookie: string) => void
  onLogout: () => void
}

function buildCookie(values: Record<CookieFieldKey, string>) {
  return COOKIE_FIELDS.map(({ key }) => {
    const v = values[key].trim()
    return v ? `${key}=${v}` : null
  })
    .filter(Boolean)
    .join('; ')
}

export function LoginPanel({
  status,
  profile,
  error,
  qrSession,
  onStartQr,
  onCookieLogin,
  onLogout,
}: LoginPanelProps) {
  const [mode, setMode] = useState<'qr' | 'cookie'>('cookie')
  const [values, setValues] = useState<Record<CookieFieldKey, string>>(emptyCookieValues)
  const [rawCookie, setRawCookie] = useState<string | null>(null)
  const busy = status === 'logging-in'
  const cookieReady = values.sessionid.trim().length > 0
  const cookieString = useMemo(
    () => rawCookie?.trim() || buildCookie(values),
    [rawCookie, values],
  )

  const applyField = (key: CookieFieldKey, raw: string) => {
    if (looksLikeFullCookie(raw)) {
      setRawCookie(raw.trim())
      setValues({ ...emptyCookieValues(), ...parseCookieString(raw) })
      return
    }
    setValues((prev) => ({ ...prev, [key]: raw }))
    setRawCookie((prev) => (prev ? upsertCookiePair(prev, key, raw) : null))
  }

  if (status === 'authenticated' && profile) {
    return (
      <div className="flex items-center justify-between gap-4 rounded-2xl border border-border-subtle bg-surface/70 px-4 py-3 shadow-sm">
        <div className="flex min-w-0 items-center gap-3">
          {profile.avatarUrl ? (
            <img
              src={profile.avatarUrl}
              alt=""
              className="h-10 w-10 rounded-xl object-cover ring-1 ring-border"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="h-10 w-10 rounded-xl bg-surface-hover" />
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">
              {profile.nickname}
            </p>
            <p className="truncate text-[11px] text-subtle">UID {profile.uid}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onLogout}
          className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-1.5 text-xs text-muted transition-all duration-200 hover:border-muted hover:bg-surface-hover hover:text-foreground"
        >
          <FontAwesomeIcon icon={faRightFromBracket} className="h-3 w-3" />
          退出
        </button>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-border-subtle bg-surface/70 p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-sm font-semibold text-foreground">
            登录抖音
          </h2>
          <p className="mt-1 max-w-md text-xs leading-relaxed text-muted">
            凭证仅保存在本机。用于拉取「作品 / 喜欢」并下载视频。扫码若被风控，请改用 Cookie。
          </p>
        </div>
        <div className="flex rounded-xl border border-border bg-background p-0.5 text-xs">
          <ModeTab active={mode === 'cookie'} onClick={() => setMode('cookie')} icon={faKey}>
            Cookie
          </ModeTab>
          <ModeTab active={mode === 'qr'} onClick={() => setMode('qr')} icon={faQrcode}>
            扫码
          </ModeTab>
        </div>
      </div>

      <div className="mt-5">
        {mode === 'cookie' ? (
          <div className="space-y-3">
            <p className="text-xs text-muted">
              在浏览器 Cookies 里按字段名找到对应项，把{' '}
              <span className="text-foreground">Value</span> 粘贴到下方（至少填
              sessionid；列表需要 UIFID）。也可把整段 Cookie 粘到任意框，会自动拆分。
            </p>
            <div className="space-y-2">
              {COOKIE_FIELDS.map((field) => (
                <label
                  key={field.key}
                  className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2"
                  htmlFor={`dy-cookie-${field.key}`}
                >
                  <span className="w-32 shrink-0 font-mono text-[11px] text-subtle">
                    {field.label}
                    {field.required ? <span className="text-danger"> *</span> : null}
                    {field.recommended ? (
                      <span className="ml-1 font-sans text-[10px] text-accent">建议</span>
                    ) : null}
                    =
                  </span>
                  <input
                    id={`dy-cookie-${field.key}`}
                    value={values[field.key]}
                    onChange={(e) => applyField(field.key, e.target.value)}
                    placeholder="粘贴 Value"
                    autoComplete="off"
                    spellCheck={false}
                    className="min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-subtle"
                  />
                </label>
              ))}
            </div>
            <p className="text-[11px] leading-relaxed text-subtle">
              浏览器登录{' '}
              <code className="text-muted">www.douyin.com</code> → F12 → Application → Cookies →
              点开各字段复制 Value。缺少 UIFID 时列表会被 Argus 拦截（403）。
            </p>
            <button
              type="button"
              disabled={busy || !cookieReady}
              onClick={() => onCookieLogin(cookieString)}
              className="inline-flex items-center gap-2 rounded-xl bg-accent px-3.5 py-2 text-xs font-medium text-accent-fg transition-all duration-200 hover:opacity-90 disabled:opacity-50"
            >
              {busy ? (
                <FontAwesomeIcon icon={faSpinner} className="h-3 w-3 animate-spin" />
              ) : (
                <FontAwesomeIcon icon={faKey} className="h-3 w-3" />
              )}
              使用 Cookie 登录
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
            <div className="flex h-40 w-40 items-center justify-center rounded-2xl border border-border bg-white p-3">
              {qrSession ? (
                <QRCodeSVG value={qrSession.qrUrl} size={136} level="M" />
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={onStartQr}
                  className="text-xs text-zinc-600 hover:text-zinc-900 disabled:opacity-50"
                >
                  {busy ? '生成中…' : '点击生成二维码'}
                </button>
              )}
            </div>
            <div className="space-y-3">
              <p className="text-xs leading-relaxed text-muted">
                {qrSession
                  ? '请使用抖音 App 扫码并确认登录。'
                  : '扫码入口可能被风控；失败时请改用 Cookie。'}
              </p>
              <button
                type="button"
                disabled={busy && !qrSession}
                onClick={onStartQr}
                className="inline-flex items-center gap-2 rounded-xl bg-accent px-3.5 py-2 text-xs font-medium text-accent-fg transition-all duration-200 hover:opacity-90 disabled:opacity-50"
              >
                <FontAwesomeIcon
                  icon={busy && !qrSession ? faSpinner : faQrcode}
                  className={`h-3 w-3 ${busy && !qrSession ? 'animate-spin' : ''}`}
                />
                {qrSession ? '刷新二维码' : '开始扫码登录'}
              </button>
            </div>
          </div>
        )}
      </div>

      {error && (
        <p className="mt-4 text-xs text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

function ModeTab({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean
  onClick: () => void
  icon: typeof faKey
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-[10px] px-2.5 py-1.5 transition-colors duration-200 ${
        active ? 'bg-surface text-foreground' : 'text-subtle hover:text-muted'
      }`}
    >
      <FontAwesomeIcon icon={icon} className="h-3 w-3" />
      {children}
    </button>
  )
}
