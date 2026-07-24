import { useState } from 'react'
import { ErrorState } from '@/components/ErrorState'
import { useGoldFactors } from './hooks/useGoldFactors'
import { FactorGrid } from './components/FactorGrid'
import { RefreshBar, SpotHero } from './components/SpotHero'

export function GoldFactorsTool() {
  const [autoRefresh, setAutoRefresh] = useState(true)
  const { snapshot, loading, refreshing, error, reload } = useGoldFactors(autoRefresh)

  const hardFail = !loading && !snapshot?.spotGold && (snapshot?.metrics.every((m) => m.value === null) ?? true)

  return (
    <div className="flex h-full flex-col gap-5 overflow-hidden p-5 md:p-6">
      <header className="flex shrink-0 flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-xl font-semibold tracking-tight text-foreground">
            黄金影响因子
          </h1>
          <p className="mt-1 max-w-xl text-xs leading-relaxed text-muted">
            实际利率 · 美元 · 通胀预期 · 风险偏好 · 央行购金（低频）。近实时与日频分层展示。
          </p>
        </div>
        <RefreshBar
          autoRefresh={autoRefresh}
          onAutoRefreshChange={setAutoRefresh}
          refreshing={refreshing}
          onRefresh={reload}
        />
      </header>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto pb-2">
        <SpotHero
          metric={snapshot?.spotGold ?? null}
          loading={loading}
          fetchedAt={snapshot?.fetchedAt ?? null}
        />

        {hardFail ? (
          <div className="rounded-2xl border border-border-subtle bg-surface/40">
            <ErrorState
              title="无法获取因子数据"
              message={error ?? '请检查网络后重试'}
              onRetry={reload}
            />
          </div>
        ) : (
          <>
            {error && !hardFail && (
              <p className="text-xs text-muted" role="status">
                {error}
              </p>
            )}
            <FactorGrid metrics={snapshot?.metrics ?? []} loading={loading && !snapshot} />
          </>
        )}

        <footer className="rounded-2xl border border-border-subtle/80 px-4 py-3 text-[11px] leading-relaxed text-subtle">
          数据源：金价 gold-api · 美元指数新浪 DINIW · 美债名义/实际利率 U.S. Treasury XML ·
          盈亏平衡由名义−实际推算 · 风险偏好用 VIXY 弱代理。FRED 在部分网络下不稳定，已不再作为主源。
        </footer>
      </div>
    </div>
  )
}

export default GoldFactorsTool
