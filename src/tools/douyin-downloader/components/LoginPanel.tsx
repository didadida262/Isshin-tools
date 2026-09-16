import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faArrowUpRightFromSquare,
  faRightFromBracket,
  faSpinner,
} from '@fortawesome/free-solid-svg-icons'
import type { AuthStatus, DouyinProfile } from '../types'

interface LoginPanelProps {
  status: AuthStatus
  profile: DouyinProfile | null
  error: string | null
  onOpenLogin: () => void
  onCancelAwaiting?: () => void
  onLogout: () => void
}

export function LoginPanel({
  status,
  profile,
  error,
  onOpenLogin,
  onCancelAwaiting,
  onLogout,
}: LoginPanelProps) {
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
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onOpenLogin}
            title="遇到验证码或风控时，可打开抖音窗口手动处理一次"
            className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-1.5 text-xs text-muted transition-all duration-200 hover:border-muted hover:bg-surface-hover hover:text-foreground"
          >
            <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="h-3 w-3" />
            抖音窗口
          </button>
          <button
            type="button"
            onClick={onLogout}
            className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-1.5 text-xs text-muted transition-all duration-200 hover:border-muted hover:bg-surface-hover hover:text-foreground"
          >
            <FontAwesomeIcon icon={faRightFromBracket} className="h-3 w-3" />
            退出
          </button>
        </div>
      </div>
    )
  }

  const checking = status === 'checking'
  const waiting = status === 'awaiting-login'

  return (
    <div className="rounded-2xl border border-border-subtle bg-surface/70 p-5 shadow-sm">
      <h2 className="font-display text-sm font-semibold text-foreground">登录抖音</h2>
      <p className="mt-1 max-w-xl text-xs leading-relaxed text-muted">
        点击下方按钮会打开一个真实的抖音网页窗口，在里面用扫码或短信登录即可。列表请求由这个窗口代为签名发出，所以不用再手填
        Cookie，也不会因为翻页而失效。登录状态保存在本机，下次直接可用。
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={checking}
          onClick={onOpenLogin}
          className="inline-flex items-center gap-2 rounded-xl bg-accent px-3.5 py-2 text-xs font-medium text-accent-fg transition-all duration-200 hover:opacity-90 disabled:opacity-50"
        >
          <FontAwesomeIcon
            icon={checking || waiting ? faSpinner : faArrowUpRightFromSquare}
            className={`h-3 w-3 ${checking || waiting ? 'animate-spin' : ''}`}
          />
          {checking ? '检测登录状态…' : waiting ? '等待登录完成…' : '打开抖音登录'}
        </button>
        {waiting && onCancelAwaiting && (
          <button
            type="button"
            onClick={onCancelAwaiting}
            className="inline-flex items-center gap-2 rounded-xl border border-border px-3.5 py-2 text-xs text-muted transition-all duration-200 hover:border-muted hover:bg-surface-hover hover:text-foreground"
          >
            取消等待
          </button>
        )}
      </div>

      {waiting && (
        <p className="mt-3 text-[11px] leading-relaxed text-subtle">
          在弹出的抖音窗口里完成登录后，这里会自动识别。关掉窗口或点「取消等待」可重新打开登录。
        </p>
      )}

      {error && (
        <p className="mt-4 text-xs text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
