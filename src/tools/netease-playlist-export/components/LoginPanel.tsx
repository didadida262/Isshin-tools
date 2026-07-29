import { useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faQrcode,
  faKey,
  faRightFromBracket,
  faSpinner,
} from '@fortawesome/free-solid-svg-icons'
import { motion } from 'framer-motion'
import type { AuthStatus, NeteaseUserProfile, QrLoginSession } from '../types'

interface LoginPanelProps {
  status: AuthStatus
  profile: NeteaseUserProfile | null
  error: string | null
  qrSession: QrLoginSession | null
  onStartQr: () => void
  onCookieLogin: (cookie: string) => void
  onLogout: () => void
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
  const [mode, setMode] = useState<'qr' | 'cookie'>('qr')
  const [cookieInput, setCookieInput] = useState('MUSIC_U=; __csrf=')
  const busy = status === 'logging-in'
  const cookieReady = /(?:^|;\s*)MUSIC_U=[^;\s]+/i.test(cookieInput)

  if (status === 'authenticated' && profile) {
    return (
      <div className="flex items-center justify-between gap-4 rounded-2xl border border-border-subtle bg-surface/70 px-4 py-3 shadow-sm">
        <div className="flex min-w-0 items-center gap-3">
          <img
            src={profile.avatarUrl}
            alt=""
            className="h-10 w-10 rounded-xl object-cover ring-1 ring-border"
            referrerPolicy="no-referrer"
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">
              {profile.nickname}
            </p>
            <p className="text-[11px] text-subtle">UID {profile.userId}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onLogout}
          className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-1.5 text-xs text-muted transition-all duration-200 ease-in-out hover:border-muted hover:bg-surface-hover hover:text-foreground"
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
            登录网易云音乐
          </h2>
          <p className="mt-1 max-w-md text-xs leading-relaxed text-muted">
            凭证仅保存在本机。仅用于拉取歌单元数据，不下载音频。
          </p>
        </div>
        <div className="flex rounded-xl border border-border bg-background p-0.5 text-xs">
          <ModeTab active={mode === 'qr'} onClick={() => setMode('qr')} icon={faQrcode}>
            扫码
          </ModeTab>
          <ModeTab
            active={mode === 'cookie'}
            onClick={() => setMode('cookie')}
            icon={faKey}
          >
            Cookie
          </ModeTab>
        </div>
      </div>

      <div className="mt-5">
        {mode === 'qr' ? (
          <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
            <div className="flex h-40 w-40 items-center justify-center rounded-2xl border border-border bg-white p-3">
              {qrSession ? (
                <QRCodeSVG value={qrSession.qrUrl} size={136} level="M" />
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={onStartQr}
                  className="text-xs text-zinc-600 transition-colors duration-200 hover:text-zinc-900 disabled:opacity-50"
                >
                  {busy ? (
                    <span className="inline-flex items-center gap-2">
                      <FontAwesomeIcon icon={faSpinner} className="h-3 w-3 animate-spin" />
                      生成中…
                    </span>
                  ) : (
                    '点击生成二维码'
                  )}
                </button>
              )}
            </div>
            <div className="space-y-3">
              <p className="text-xs leading-relaxed text-muted">
                {qrSession
                  ? '请使用网易云 App 扫码并确认登录。'
                  : '使用网易云 App 扫码并确认登录。二维码过期后可重新生成。'}
              </p>
              <button
                type="button"
                disabled={busy && !qrSession}
                onClick={onStartQr}
                className="inline-flex items-center gap-2 rounded-xl bg-accent px-3.5 py-2 text-xs font-medium text-accent-fg transition-all duration-200 ease-in-out hover:opacity-90 disabled:opacity-50"
              >
                {busy && !qrSession ? (
                  <FontAwesomeIcon icon={faSpinner} className="h-3 w-3 animate-spin" />
                ) : (
                  <FontAwesomeIcon icon={faQrcode} className="h-3 w-3" />
                )}
                {busy && !qrSession ? '生成中…' : qrSession ? '刷新二维码' : '开始扫码登录'}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <label className="block text-xs text-muted" htmlFor="cookie-input">
              粘贴浏览器 Cookie（MUSIC_U 必填，建议带上 __csrf）
            </label>
            <textarea
              id="cookie-input"
              value={cookieInput}
              onChange={(e) => setCookieInput(e.target.value)}
              rows={3}
              placeholder="在 MUSIC_U= 和 __csrf= 后粘贴对应值"
              className="w-full resize-y rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground outline-none transition-all duration-200 placeholder:text-subtle focus:border-muted focus:ring-1 focus:ring-border"
            />
            <p className="text-[11px] leading-relaxed text-subtle">
              DevTools → Application → Cookies → music.163.com，把{' '}
              <code className="text-muted">MUSIC_U</code> /{' '}
              <code className="text-muted">__csrf</code> 的值填到等号后面。连不上时可改用扫码。
            </p>
            <button
              type="button"
              disabled={busy || !cookieReady}
              onClick={() => onCookieLogin(cookieInput)}
              className="inline-flex items-center gap-2 rounded-xl bg-accent px-3.5 py-2 text-xs font-medium text-accent-fg transition-all duration-200 ease-in-out hover:opacity-90 disabled:opacity-50"
            >
              {busy ? (
                <FontAwesomeIcon icon={faSpinner} className="h-3 w-3 animate-spin" />
              ) : (
                <FontAwesomeIcon icon={faKey} className="h-3 w-3" />
              )}
              使用 Cookie 登录
            </button>
          </div>
        )}
      </div>

      {error && (
        <motion.p
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-4 text-xs text-danger"
          role="alert"
        >
          {error}
        </motion.p>
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
  icon: typeof faQrcode
  children: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-[10px] px-2.5 py-1.5 transition-all duration-200 ease-in-out ${
        active
          ? 'bg-surface-hover text-foreground shadow-sm'
          : 'text-subtle hover:text-muted'
      }`}
    >
      <FontAwesomeIcon icon={icon} className="h-3 w-3" />
      {children}
    </button>
  )
}
