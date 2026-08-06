import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faArrowRotateLeft,
  faFolderOpen,
  faPlay,
  faStop,
} from '@fortawesome/free-solid-svg-icons'
import { PickDirectoryButton } from './components/PickDirectoryButton'
import { TrimProgressList } from './components/TrimProgressList'
import { useBatchTrim } from './hooks/useBatchTrim'
import { DEFAULT_TRIM_SECONDS } from './types'

export function DouyinTrimEndTool() {
  const {
    phase,
    dir,
    trimSeconds,
    setTrimSeconds,
    items,
    error,
    successCount,
    failCount,
    doneCount,
    pickDirectory,
    start,
    stop,
    reset,
    openOutputFolder,
  } = useBatchTrim()

  const isIdle = phase === 'idle'
  const canStart = (phase === 'ready' || phase === 'done') && items.length > 0

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {isIdle ? (
        <PickDirectoryButton onPick={() => void pickDirectory()} />
      ) : (
        <div className="flex h-full flex-col gap-4 overflow-hidden p-5 md:p-6">
          <header className="shrink-0">
            <h1 className="font-display text-xl font-semibold tracking-tight text-foreground">
              抖音视频结尾切除
            </h1>
            <p className="mt-1 text-xs text-muted">
              批量去掉片尾冗余帧 · 输出到同级{' '}
              <code className="rounded bg-background/80 px-1 py-0.5 text-[11px]">trimmed/</code>{' '}
              子目录
            </p>
          </header>

          <div className="shrink-0 rounded-2xl border border-border-subtle bg-surface/50 px-4 py-3">
            <div className="flex flex-wrap items-center gap-3">
              <p className="min-w-0 flex-1 truncate text-xs text-muted" title={dir ?? undefined}>
                {dir}
              </p>
              <label className="flex items-center gap-2 text-xs text-muted">
                切除末尾
                <input
                  type="number"
                  min={0.5}
                  max={30}
                  step={0.5}
                  value={trimSeconds}
                  disabled={phase === 'running'}
                  onChange={(e) => {
                    const v = Number(e.target.value)
                    if (Number.isFinite(v)) setTrimSeconds(Math.min(30, Math.max(0.5, v)))
                  }}
                  className="w-16 rounded-lg border border-border bg-background px-2 py-1 text-foreground outline-none focus:border-accent/50"
                />
                秒
              </label>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {phase === 'running' ? (
                <button
                  type="button"
                  onClick={stop}
                  className="inline-flex items-center gap-2 rounded-xl border border-danger/40 bg-danger/10 px-3.5 py-2 text-sm text-danger transition hover:bg-danger/15"
                >
                  <FontAwesomeIcon icon={faStop} className="h-3.5 w-3.5" />
                  停止
                </button>
              ) : (
                <button
                  type="button"
                  disabled={!canStart}
                  onClick={() => void start()}
                  className="inline-flex items-center gap-2 rounded-xl bg-accent px-3.5 py-2 text-sm font-medium text-accent-fg transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <FontAwesomeIcon icon={faPlay} className="h-3.5 w-3.5" />
                  {phase === 'done' ? '重新处理' : '开始切除'}
                </button>
              )}

              <button
                type="button"
                disabled={phase === 'running'}
                onClick={() => void pickDirectory()}
                className="inline-flex items-center gap-2 rounded-xl border border-border px-3.5 py-2 text-sm text-muted transition hover:bg-surface-hover hover:text-foreground disabled:opacity-40"
              >
                <FontAwesomeIcon icon={faFolderOpen} className="h-3.5 w-3.5" />
                重选目录
              </button>

              <button
                type="button"
                disabled={phase === 'running'}
                onClick={reset}
                className="inline-flex items-center gap-2 rounded-xl border border-border px-3.5 py-2 text-sm text-muted transition hover:bg-surface-hover hover:text-foreground disabled:opacity-40"
              >
                <FontAwesomeIcon icon={faArrowRotateLeft} className="h-3.5 w-3.5" />
                回到首页
              </button>

              {(phase === 'done' || successCount > 0) && (
                <button
                  type="button"
                  onClick={() => void openOutputFolder()}
                  className="inline-flex items-center gap-2 rounded-xl border border-border px-3.5 py-2 text-sm text-muted transition hover:bg-surface-hover hover:text-foreground"
                >
                  打开输出目录
                </button>
              )}
            </div>
          </div>

          {error && (
            <p className="shrink-0 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
              {error}
            </p>
          )}

          <div className="flex min-h-0 flex-1 flex-col gap-2">
            <div className="flex shrink-0 items-center justify-between text-[11px] text-subtle">
              <span>
                共 {items.length} 个视频
                {phase === 'running' || phase === 'done'
                  ? ` · 已处理 ${doneCount}`
                  : ` · 默认切除 ${DEFAULT_TRIM_SECONDS}s`}
              </span>
              {(phase === 'running' || phase === 'done') && (
                <span>
                  成功 {successCount}
                  {failCount > 0 ? ` · 失败 ${failCount}` : ''}
                </span>
              )}
            </div>
            {items.length > 0 ? (
              <TrimProgressList items={items} />
            ) : (
              <div className="flex flex-1 items-center justify-center rounded-2xl border border-dashed border-border-subtle">
                <p className="text-xs text-muted">当前目录没有可处理的视频</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default DouyinTrimEndTool
