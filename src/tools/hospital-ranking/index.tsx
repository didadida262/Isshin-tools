import { useMemo, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faRotateRight, faSpinner } from '@fortawesome/free-solid-svg-icons'
import { ErrorState } from '@/components/ErrorState'
import { Skeleton } from '@/components/Skeleton'
import { useHospitalRanking } from './hooks/useHospitalRanking'
import { GRADE_ORDER, type HospitalGrade } from './types'

export function HospitalRankingTool() {
  const { snapshot, loading, error, reload } = useHospitalRanking()
  const [query, setQuery] = useState('')
  const [gradeFilter, setGradeFilter] = useState<HospitalGrade | 'all'>('all')

  const filtered = useMemo(() => {
    const list = snapshot?.hospitals ?? []
    const q = query.trim().toLowerCase()
    return list.filter((item) => {
      if (gradeFilter !== 'all' && item.grade !== gradeFilter) return false
      if (!q) return true
      return item.name.toLowerCase().includes(q)
    })
  }, [snapshot, query, gradeFilter])

  const gradeCounts = useMemo(() => {
    const map = new Map<HospitalGrade, number>()
    for (const g of GRADE_ORDER) map.set(g, 0)
    for (const item of snapshot?.hospitals ?? []) {
      map.set(item.grade, (map.get(item.grade) ?? 0) + 1)
    }
    return map
  }, [snapshot])

  return (
    <div className="flex h-full flex-col gap-5 overflow-hidden p-5 md:p-6">
      <header className="shrink-0">
        <h1 className="font-display text-xl font-semibold tracking-tight text-foreground">
          中国大陆医院靠谱榜
        </h1>
        <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted">
          数据来源限定复旦大学中国医院综合排行榜（健康界同步）· 自动取源站最新已发布年度 ·
          该榜通常每年 11 月发布「上一年度」结果，因此不会出现当年完整榜单
        </p>
      </header>

      <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索医院名称…"
          aria-label="搜索医院"
          className="h-8 min-w-0 flex-1 rounded-xl border border-border bg-background px-3 text-xs text-foreground outline-none transition-colors placeholder:text-subtle focus:border-muted"
        />
        <select
          value={snapshot?.year ?? ''}
          disabled={loading || !snapshot?.years.length}
          onChange={(e) => {
            const y = Number(e.target.value)
            if (Number.isFinite(y)) void reload(y)
          }}
          aria-label="榜单年度"
          className="h-8 shrink-0 rounded-xl border border-border bg-background px-3 text-xs text-foreground outline-none transition-colors focus:border-muted disabled:cursor-not-allowed disabled:opacity-40"
        >
          {(snapshot?.years ?? []).map((y) => (
            <option key={y} value={y}>
              {y}年度
            </option>
          ))}
          {!snapshot?.years.length && (
            <option value="">加载年份…</option>
          )}
        </select>
        <button
          type="button"
          disabled={loading}
          onClick={() => void reload(snapshot?.year)}
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-xl border border-border bg-surface px-3 text-[11px] font-medium text-foreground transition-colors hover:border-muted hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-40"
        >
          <FontAwesomeIcon
            icon={loading ? faSpinner : faRotateRight}
            className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`}
          />
          刷新
        </button>
      </div>

      <div className="flex shrink-0 flex-wrap gap-1.5">
        <GradeChip
          active={gradeFilter === 'all'}
          onClick={() => setGradeFilter('all')}
          label={`全部 ${snapshot?.hospitals.length ?? 0}`}
        />
        {GRADE_ORDER.map((grade) => (
          <GradeChip
            key={grade}
            active={gradeFilter === grade}
            onClick={() => setGradeFilter(grade)}
            label={`${grade} ${gradeCounts.get(grade) ?? 0}`}
          />
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-border-subtle bg-surface/60">
        {loading && !snapshot ? (
          <div className="space-y-3 p-4" role="status" aria-label="加载中">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : error && !snapshot ? (
          <div className="p-4">
            <ErrorState
              title="无法获取医院排行榜"
              message={error}
              onRetry={() => void reload()}
            />
          </div>
        ) : (
          <div className="flex h-full min-h-0 flex-col">
            <div className="shrink-0 border-b border-border-subtle px-4 py-3">
              <h2 className="text-sm font-medium text-foreground">
                {snapshot?.year}年度中国医院综合排行榜
              </h2>
              <p className="mt-1 text-[11px] text-subtle">
                {snapshot?.note}
                {error ? ` · ${error}` : ''}
              </p>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              <table className="w-full border-collapse text-sm">
                <thead className="sticky top-0 z-10 bg-surface">
                  <tr className="border-b border-border-subtle text-[10px] uppercase tracking-wider text-subtle">
                    <th className="w-[30%] px-4 py-2.5 text-center font-medium">
                      等级
                    </th>
                    <th className="px-4 py-2.5 text-center font-medium">医院</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td
                        colSpan={2}
                        className="px-4 py-10 text-center text-xs text-muted"
                      >
                        没有匹配的医院
                      </td>
                    </tr>
                  ) : (
                    filtered.map((item) => (
                      <tr
                        key={`${item.grade}-${item.name}`}
                        className="border-b border-border-subtle/60 transition-colors hover:bg-surface-hover/40"
                      >
                        <td className="px-4 py-2.5 text-center">
                          <span className="inline-flex min-w-[4.5rem] items-center justify-center rounded-lg border border-border-subtle bg-background/60 px-2 py-0.5 text-xs font-medium tabular-nums text-foreground">
                            {item.grade}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-center text-xs text-foreground">
                          {item.name}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <footer className="shrink-0 border-t border-border-subtle px-4 py-2.5 text-[10px] leading-relaxed text-subtle">
              数据源：{snapshot?.source}
              {snapshot?.fetchedAt
                ? ` · 拉取于 ${new Date(snapshot.fetchedAt).toLocaleString('zh-CN', { hour12: false })}`
                : ''}
              {filtered.length !== (snapshot?.hospitals.length ?? 0)
                ? ` · 显示 ${filtered.length}/${snapshot?.hospitals.length ?? 0}`
                : ` · 共 ${snapshot?.hospitals.length ?? 0} 家`}
            </footer>
          </div>
        )}
      </div>
    </div>
  )
}

function GradeChip({
  active,
  label,
  onClick,
}: {
  active: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-7 items-center rounded-lg border px-2.5 text-[11px] transition-colors ${
        active
          ? 'border-border bg-foreground text-background'
          : 'border-border-subtle bg-background text-muted hover:border-border hover:text-foreground'
      }`}
    >
      {label}
    </button>
  )
}
