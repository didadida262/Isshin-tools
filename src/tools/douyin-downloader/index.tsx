import { useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { LoginPanel } from './components/LoginPanel'
import { AwemePanel } from './components/AwemePanel'
import { useAwemeList } from './hooks/useAwemeList'
import { useDouyinAuth } from './hooks/useDouyinAuth'
import {
  useDownloadedAweme,
  useDownloadedMapForKind,
} from './hooks/useDownloadedAweme'
import type { DouyinListKind } from './types'

export function DouyinDownloaderTool() {
  const auth = useDouyinAuth()
  const [kind, setKind] = useState<DouyinListKind>('favorite')
  const [batchActive, setBatchActive] = useState(false)
  const list = useAwemeList(auth.cookie, auth.profile?.secUid ?? null, kind)
  const downloaded = useDownloadedAweme()
  const downloadedById = useDownloadedMapForKind(downloaded.byKey, kind)

  return (
    <div className="flex h-full flex-col gap-4 overflow-hidden p-5 md:p-6">
      <header className="shrink-0">
        <h1 className="font-display text-xl font-semibold tracking-tight text-foreground">
          抖音下载器
        </h1>
        <p className="mt-1 text-xs text-muted">
          登录后查看作品 / 喜欢 · 下载目录与已下载状态按分类分开 · 一键下载 / 取消喜欢会持续处理直到没有更多内容
        </p>
      </header>

      <div className="shrink-0">
        <LoginPanel
          status={auth.status}
          profile={auth.profile}
          error={auth.error}
          qrSession={auth.qrSession}
          onStartQr={() => void auth.startQrLogin()}
          onCookieLogin={(c) => void auth.loginWithCookie(c)}
          onLogout={() => void auth.logout()}
        />
      </div>

      {auth.status === 'authenticated' && auth.cookie ? (
        <>
          <div className="relative flex shrink-0 gap-1 self-start rounded-xl border border-border bg-background p-0.5 text-xs">
            <KindTab
              active={kind === 'favorite'}
              disabled={batchActive}
              onClick={() => setKind('favorite')}
            >
              喜欢
            </KindTab>
            <KindTab
              active={kind === 'post'}
              disabled={batchActive}
              onClick={() => setKind('post')}
            >
              作品
            </KindTab>
          </div>
          <div className="relative min-h-0 flex-1 overflow-hidden">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={kind}
                className="flex h-full min-h-0 flex-col"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
              >
                <AwemePanel
                  kind={kind}
                  cookie={auth.cookie}
                  items={list.items}
                  loading={list.loading}
                  error={list.error}
                  hasMore={list.hasMore}
                  downloadedById={downloadedById}
                  onRetry={() => void list.reload()}
                  onLoadMore={() => list.loadMore()}
                  onDownloaded={downloaded.markDownloaded}
                  onRefreshAfterUnlike={() => list.reload({ clear: false })}
                  onBatchActiveChange={setBatchActive}
                />
              </motion.div>
            </AnimatePresence>
          </div>
        </>
      ) : (
        <div className="flex min-h-0 flex-1 items-center justify-center rounded-2xl border border-dashed border-border-subtle">
          <p className="max-w-sm px-6 text-center text-xs leading-relaxed text-muted">
            登录后将展示你的抖音「作品」与「喜欢」，可预览并下载到本地。
          </p>
        </div>
      )}
    </div>
  )
}

function KindTab({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean
  disabled?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`relative rounded-[10px] px-3 py-1.5 transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-40 ${
        active ? 'text-foreground' : 'text-subtle hover:text-muted'
      }`}
    >
      {active && (
        <motion.span
          layoutId="douyin-kind-tab-pill"
          className="absolute inset-0 rounded-[10px] bg-surface"
          transition={{ type: 'spring', stiffness: 420, damping: 34 }}
        />
      )}
      <span className="relative z-10">{children}</span>
    </button>
  )
}

export default DouyinDownloaderTool
