import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faCheck,
  faCircleNotch,
  faClock,
  faXmark,
} from '@fortawesome/free-solid-svg-icons'
import type { TrimQueueItem } from '../types'

interface Props {
  items: TrimQueueItem[]
}

export function TrimProgressList({ items }: Props) {
  return (
    <ul className="divide-y divide-border-subtle overflow-y-auto rounded-2xl border border-border-subtle bg-surface/40">
      {items.map((item) => (
        <li key={item.entry.path} className="flex items-start gap-3 px-4 py-3">
          <StatusIcon status={item.status} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-foreground">{item.entry.name}</p>
            <p className="mt-0.5 truncate text-[11px] text-subtle">
              {item.status === 'pending' && '等待处理'}
              {item.status === 'running' && '正在切除…'}
              {item.status === 'done' &&
                (item.result?.durationAfter != null
                  ? `完成 · ${item.result.durationBefore?.toFixed(1)}s → ${item.result.durationAfter.toFixed(1)}s`
                  : '完成')}
              {item.status === 'error' && (item.result?.error ?? '失败')}
            </p>
          </div>
        </li>
      ))}
    </ul>
  )
}

function StatusIcon({ status }: { status: TrimQueueItem['status'] }) {
  const base =
    'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px]'
  if (status === 'running') {
    return (
      <span className={`${base} bg-background text-accent`}>
        <FontAwesomeIcon icon={faCircleNotch} className="animate-spin" />
      </span>
    )
  }
  if (status === 'done') {
    return (
      <span className={`${base} bg-success/15 text-success`}>
        <FontAwesomeIcon icon={faCheck} />
      </span>
    )
  }
  if (status === 'error') {
    return (
      <span className={`${base} bg-danger/15 text-danger`}>
        <FontAwesomeIcon icon={faXmark} />
      </span>
    )
  }
  return (
    <span className={`${base} bg-background text-subtle`}>
      <FontAwesomeIcon icon={faClock} />
    </span>
  )
}
