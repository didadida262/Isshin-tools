import type { FactorObservation, FactorMetric, GoldFactorsSnapshot } from '../types'
import { errorMessage, httpGetText, httpGetJson } from './http'

interface GoldApiPrice {
  currency: string
  name: string
  price: number
  symbol: string
  updatedAt: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

const SESSION_PREV_KEY = 'isshin.gold-factors.prev'

function readSessionPrev(): Record<string, number> {
  try {
    const raw = sessionStorage.getItem(SESSION_PREV_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed)) return {}
    const out: Record<string, number> = {}
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === 'number' && Number.isFinite(v)) out[k] = v
    }
    return out
  } catch {
    return {}
  }
}

function writeSessionPrev(values: Record<string, number>) {
  try {
    sessionStorage.setItem(SESSION_PREV_KEY, JSON.stringify(values))
  } catch {
    // ignore
  }
}

function metricBase(
  partial: Omit<FactorMetric, 'value' | 'previousValue' | 'asOf' | 'error'> & {
    value?: number | null
    previousValue?: number | null
    asOf?: string | null
    error?: string
  },
): FactorMetric {
  return {
    value: partial.value ?? null,
    previousValue: partial.previousValue ?? null,
    asOf: partial.asOf ?? null,
    error: partial.error,
    id: partial.id,
    label: partial.label,
    shortLabel: partial.shortLabel,
    description: partial.description,
    cadence: partial.cadence,
    unit: partial.unit,
    source: partial.source,
    goldFriendlyWhen: partial.goldFriendlyWhen,
  }
}

/** Parse US Treasury `yield.xml` / `real_yield.xml` curve snapshots. */
export function parseTreasuryCurveXml(
  xml: string,
  dateTag: string,
  valueTag: string,
): FactorObservation[] {
  const chunks = xml.split(new RegExp(`<${dateTag}>`)).slice(1)
  const out: FactorObservation[] = []

  for (const chunk of chunks) {
    const dateEnd = chunk.indexOf(`</${dateTag}>`)
    if (dateEnd < 0) continue
    const date = normalizeTreasuryDate(chunk.slice(0, dateEnd).trim())
    const valueMatch = chunk.match(new RegExp(`<${valueTag}>\\s*([^<]+)</${valueTag}>`))
    if (!valueMatch?.[1]) continue
    const value = Number(valueMatch[1].trim())
    if (!Number.isFinite(value)) continue
    out.push({ date, value })
  }

  return out
}

function normalizeTreasuryDate(raw: string): string {
  // e.g. 23-JUL-26
  const m = raw.match(/^(\d{1,2})-([A-Z]{3})-(\d{2})$/i)
  if (!m) return raw
  const months: Record<string, string> = {
    JAN: '01',
    FEB: '02',
    MAR: '03',
    APR: '04',
    MAY: '05',
    JUN: '06',
    JUL: '07',
    AUG: '08',
    SEP: '09',
    OCT: '10',
    NOV: '11',
    DEC: '12',
  }
  const dd = m[1]!.padStart(2, '0')
  const mm = months[m[2]!.toUpperCase()]
  const yy = m[3]!
  if (!mm) return raw
  return `20${yy}-${mm}-${dd}`
}

function lastTwo(obs: FactorObservation[]): {
  current: FactorObservation | null
  previous: FactorObservation | null
} {
  if (obs.length === 0) return { current: null, previous: null }
  return {
    current: obs[obs.length - 1] ?? null,
    previous: obs.length > 1 ? (obs[obs.length - 2] ?? null) : null,
  }
}

/** Sina `hq_str_DINIW` dollar index quote. */
export function parseSinaDiniw(raw: string): {
  value: number
  previous: number | null
  asOf: string
} {
  const match = raw.match(/hq_str_DINIW="([^"]*)"/)
  if (!match?.[1]) throw new Error('新浪美元指数行情为空')
  const parts = match[1].split(',')
  const value = Number(parts[1])
  const previous = Number(parts[3])
  const time = parts[0] ?? ''
  const date = parts[parts.length - 1] ?? ''
  if (!Number.isFinite(value)) throw new Error('新浪美元指数解析失败')
  return {
    value,
    previous: Number.isFinite(previous) ? previous : null,
    asOf: `${date} ${time}`.trim(),
  }
}

async function fetchSpotGold(sessionPrev: number | undefined): Promise<FactorMetric> {
  const base = {
    id: 'xau-usd',
    label: '现货金价',
    shortLabel: 'XAU',
    description: '无对手方计价锚 · 实时现货代理',
    cadence: 'realtime' as const,
    unit: 'USD/oz',
    source: 'gold-api.com',
    goldFriendlyWhen: 'context' as const,
  }

  try {
    const live = await httpGetJson<GoldApiPrice>('https://api.gold-api.com/price/XAU')
    if (!isRecord(live) || typeof live.price !== 'number') {
      throw new Error('金价响应无效')
    }
    return metricBase({
      ...base,
      value: live.price,
      previousValue: sessionPrev ?? null,
      asOf: typeof live.updatedAt === 'string' ? live.updatedAt : new Date().toISOString(),
    })
  } catch (e) {
    return metricBase({
      ...base,
      error: errorMessage(e) || '金价拉取失败',
    })
  }
}

async function fetchDxy(): Promise<FactorMetric> {
  const base = {
    id: 'dxy',
    label: '美元指数',
    shortLabel: 'DXY',
    description: '美元强弱 · 与金价通常负相关',
    cadence: 'realtime' as const,
    unit: 'index',
    source: '新浪财经 DINIW',
    goldFriendlyWhen: 'down' as const,
  }

  try {
    const raw = await httpGetText('https://hq.sinajs.cn/list=DINIW')
    const q = parseSinaDiniw(raw)
    return metricBase({
      ...base,
      value: q.value,
      previousValue: q.previous,
      asOf: q.asOf,
    })
  } catch (e) {
    return metricBase({
      ...base,
      error: errorMessage(e) || '美元指数拉取失败',
    })
  }
}

async function fetchTreasuryMetric(opts: {
  id: string
  url: string
  dateTag: string
  valueTag: string
  label: string
  shortLabel: string
  description: string
  source: string
  goldFriendlyWhen: FactorMetric['goldFriendlyWhen']
}): Promise<FactorMetric> {
  const base = {
    id: opts.id,
    label: opts.label,
    shortLabel: opts.shortLabel,
    description: opts.description,
    cadence: 'daily' as const,
    unit: '%',
    source: opts.source,
    goldFriendlyWhen: opts.goldFriendlyWhen,
  }

  try {
    const xml = await httpGetText(opts.url)
    const { current, previous } = lastTwo(
      parseTreasuryCurveXml(xml, opts.dateTag, opts.valueTag),
    )
    if (!current) throw new Error('无有效观测值')
    return metricBase({
      ...base,
      value: current.value,
      previousValue: previous?.value ?? null,
      asOf: current.date,
    })
  } catch (e) {
    return metricBase({
      ...base,
      error: errorMessage(e) || '美债曲线拉取失败',
    })
  }
}

function buildBreakeven(
  nominal: FactorMetric,
  real: FactorMetric,
): FactorMetric {
  const base = {
    id: 'breakeven-10y',
    label: '10Y 盈亏平衡通胀',
    shortLabel: 'BEI≈',
    description: '名义 − 实际 · 通胀预期代理（非 FRED T10YIE 原值）',
    cadence: 'daily' as const,
    unit: '%',
    source: 'Treasury 推算',
    goldFriendlyWhen: 'up' as const,
  }

  if (nominal.value === null || real.value === null) {
    return metricBase({
      ...base,
      error: '依赖名义/实际利率均可用',
    })
  }

  const value = nominal.value - real.value
  const previous =
    nominal.previousValue !== null && real.previousValue !== null
      ? nominal.previousValue - real.previousValue
      : null

  return metricBase({
    ...base,
    value,
    previousValue: previous,
    asOf: nominal.asOf ?? real.asOf,
  })
}

async function fetchRiskProxy(): Promise<FactorMetric> {
  const base = {
    id: 'vix-proxy',
    label: '风险偏好代理',
    shortLabel: 'VIXY',
    description: 'VIXY ETF · VIX 弱代理（非 VIX 现货指数）',
    cadence: 'realtime' as const,
    unit: 'USD',
    source: '东方财富 107.VIXY',
    goldFriendlyWhen: 'up' as const,
  }

  try {
    const raw = await httpGetText(
      'https://push2.eastmoney.com/api/qt/stock/get?secid=107.VIXY&fields=f43,f57,f58,f60,f169,f170',
    )
    const json: unknown = JSON.parse(raw)
    if (!isRecord(json) || !isRecord(json.data)) {
      throw new Error('VIXY 响应无效')
    }
    const data = json.data
    // Eastmoney stores prices * 1000 for US stocks often (f43=21780 => 21.780)
    const last = typeof data.f43 === 'number' ? data.f43 / 1000 : null
    const prev = typeof data.f60 === 'number' ? data.f60 / 1000 : null
    if (last === null) throw new Error('VIXY 无最新价')
    return metricBase({
      ...base,
      value: last,
      previousValue: prev,
      asOf: new Date().toISOString(),
    })
  } catch (e) {
    return metricBase({
      ...base,
      error: errorMessage(e) || '风险代理拉取失败',
    })
  }
}

function centralBankPlaceholder(): FactorMetric {
  return metricBase({
    id: 'cb-gold',
    label: '央行净购金',
    shortLabel: 'CB',
    description: '官方储备需求 · WGC 月报级，无法稳定实时抓取',
    cadence: 'monthly',
    unit: 't',
    source: 'World Gold Council（手动跟踪）',
    goldFriendlyWhen: 'up',
    value: null,
    previousValue: null,
    asOf: null,
  })
}

/**
 * Uses China-reachable sources (Treasury XML + Sina + gold-api).
 * FRED is intentionally not primary — often blocked / HTTP2-unstable.
 */
export async function fetchGoldFactorsSnapshot(): Promise<GoldFactorsSnapshot> {
  const sessionPrev = readSessionPrev()

  const [spotGold, dxy, nominal10y, realYield, risk] = await Promise.all([
    fetchSpotGold(sessionPrev['xau-usd']),
    fetchDxy(),
    fetchTreasuryMetric({
      id: 'nominal-10y',
      url: 'https://home.treasury.gov/sites/default/files/interest-rates/yield.xml',
      dateTag: 'BID_CURVE_DATE',
      valueTag: 'BC_10YEAR',
      label: '10Y 名义利率',
      shortLabel: 'UST',
      description: '美债名义收益率 · UST 日曲线',
      source: 'U.S. Treasury yield.xml',
      goldFriendlyWhen: 'down',
    }),
    fetchTreasuryMetric({
      id: 'real-yield-10y',
      url: 'https://home.treasury.gov/sites/default/files/interest-rates/real_yield.xml',
      dateTag: 'TIPS_CURVE_DATE',
      valueTag: 'TC_10YEAR',
      label: '10Y 实际利率',
      shortLabel: 'Real',
      description: 'TIPS 实际收益率 · 持金机会成本（核心）',
      source: 'U.S. Treasury real_yield.xml',
      goldFriendlyWhen: 'down',
    }),
    fetchRiskProxy(),
  ])

  const breakeven = buildBreakeven(nominal10y, realYield)

  const nextPrev: Record<string, number> = { ...sessionPrev }
  if (spotGold.value !== null) nextPrev['xau-usd'] = spotGold.value
  writeSessionPrev(nextPrev)

  const metrics: FactorMetric[] = [
    spotGold,
    realYield,
    dxy,
    breakeven,
    nominal10y,
    risk,
    centralBankPlaceholder(),
  ]

  return {
    fetchedAt: new Date().toISOString(),
    metrics,
    spotGold: spotGold.value !== null ? spotGold : null,
  }
}

// Keep export for unit-style reuse / future FRED fallback experiments.
export { lastTwo }
