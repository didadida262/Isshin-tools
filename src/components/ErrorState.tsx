import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faTriangleExclamation, faRotateRight } from '@fortawesome/free-solid-svg-icons'

interface ErrorStateProps {
  title?: string
  message: string
  onRetry?: () => void
}

export function ErrorState({
  title = '出错了',
  message,
  onRetry,
}: ErrorStateProps) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center"
      role="alert"
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-danger/10 text-danger">
        <FontAwesomeIcon icon={faTriangleExclamation} className="h-4 w-4" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="max-w-sm text-xs leading-relaxed text-muted">{message}</p>
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-1 inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-1.5 text-xs text-foreground transition-all duration-200 ease-in-out hover:border-muted hover:bg-surface-hover hover:shadow-sm"
        >
          <FontAwesomeIcon icon={faRotateRight} className="h-3 w-3" />
          重试
        </button>
      )}
    </div>
  )
}
