import type {
  FactorBreakdownSlice,
  FactorObservation,
  FactorMetric,
  GoldFactorsSnapshot,
} from '../types'
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

function metricBase(
  partial: Omit<FactorMetric, 'value' | 'previousValue' | 'asOf' | 'error' | 'breakdown'> & {
    value?: number | null
    previousValue?: number | null
    asOf?: string | null
    error?: string
    breakdown?: FactorMetric['breakdown']
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
    breakdown: partial.breakdown,
  }
}

function extractSinaQuoted(raw: string, key: string): string {
  const match = raw.match(new RegExp(`hq_str_${key}="([^"]*)"`))
  if (!match?.[1]?.trim()) throw new Error(`新浪行情为空 · ${key}`)
  return match[1]
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
  const parts = extractSinaQuoted(raw, 'DINIW').split(',')
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

/** Sina futures/spot gold `hf_XAU`. */
export function parseSinaHfXau(raw: string): {
  value: number
  previous: number | null
  asOf: string
} {
  const parts = extractSinaQuoted(raw, 'hf_XAU').split(',')
  const value = Number(parts[0])
  const previous = Number(parts[7])
  const time = parts[6] ?? ''
  const date = parts[12] ?? ''
  if (!Number.isFinite(value)) throw new Error('新浪金价解析失败')
  return {
    value,
    previous: Number.isFinite(previous) ? previous : null,
    asOf: `${date} ${time}`.trim(),
  }
}

/** Sina SHFE gold continuous `nf_AU0`（沪金连续，元/克）. */
export function parseSinaNfAu0(raw: string): {
  value: number
  previous: number | null
  asOf: string
  name: string
} {
  const parts = extractSinaQuoted(raw, 'nf_AU0').split(',')
  // 最新价 / 昨结；字段顺序见新浪商品期货行情
  const value = Number(parts[8])
  const previous = Number(parts[10])
  const name = parts[0] ?? '黄金连续'
  const date = parts[17] ?? ''
  if (!Number.isFinite(value) || value <= 0) throw new Error('新浪沪金解析失败')
  return {
    value,
    previous: Number.isFinite(previous) && previous > 0 ? previous : null,
    asOf: date.trim(),
    name,
  }
}

/** Sina US stock `gb_*` quote (e.g. gb_vixy). */
export function parseSinaGbStock(raw: string, key: string): {
  value: number
  previous: number | null
  asOf: string
} {
  const parts = extractSinaQuoted(raw, key).split(',')
  const value = Number(parts[1])
  const changeAbs = Number(parts[4])
  const asOf = parts[3] ?? ''
  if (!Number.isFinite(value)) throw new Error(`新浪 ${key} 解析失败`)
  const previous = Number.isFinite(changeAbs) ? value - changeAbs : null
  return {
    value,
    previous: previous !== null && Number.isFinite(previous) ? previous : null,
    asOf,
  }
}

export function parseWgcCentralBankNetTonnes(html: string): {
  value: number
  periodLabel: string
} | null {
  // Prefer the last match — teaser/meta often lags the corrected body figure.
  const patterns: Array<{ re: RegExp; sign: 1 | -1 }> = [
    { re: /increased by a net\s+(\d+(?:\.\d+)?)\s*t/gi, sign: 1 },
    {
      re: /net gold purchases[^.]{0,120}?having bought\s+(\d+(?:\.\d+)?)\s*t/gi,
      sign: 1,
    },
    // 2026-08+ wording: "Central banks bought 51t of gold in June"
    { re: /central banks bought\s+(\d+(?:\.\d+)?)\s*t(?:\s+of gold)?/gi, sign: 1 },
    { re: /bought\s+(\d+(?:\.\d+)?)\s*t of gold/gi, sign: 1 },
    { re: /net purchases?(?:\s+of gold)?[^.]{0,40}?(\d+(?:\.\d+)?)\s*t/gi, sign: 1 },
    { re: /net sales[^.]{0,40}?(\d+(?:\.\d+)?)\s*t/gi, sign: -1 },
  ]

  let value: number | null = null
  for (const { re, sign } of patterns) {
    const matches = [...html.matchAll(re)]
    if (matches.length === 0) continue
    const raw = Number(matches[matches.length - 1]![1])
    if (!Number.isFinite(raw)) continue
    value = sign * raw
    break
  }

  if (value === null || !Number.isFinite(value)) return null

  const month = html.match(
    /\bin (January|February|March|April|May|June|July|August|September|October|November|December)\b/i,
  )
  return {
    value,
    periodLabel: month?.[1] ?? 'latest',
  }
}

const BANK_COUNTRY_ZH: Array<{ match: RegExp; label: string }> = [
  { match: /poland/i, label: '波兰' },
  { match: /china|people.?s bank of china/i, label: '中国' },
  { match: /uzbekistan/i, label: '乌兹别克斯坦' },
  { match: /kazakhstan/i, label: '哈萨克斯坦' },
  { match: /singapore/i, label: '新加坡' },
  { match: /turkey/i, label: '土耳其' },
  { match: /russia/i, label: '俄罗斯' },
  { match: /india/i, label: '印度' },
  { match: /czech/i, label: '捷克' },
  { match: /qatar/i, label: '卡塔尔' },
  { match: /hungary/i, label: '匈牙利' },
  { match: /brazil/i, label: '巴西' },
  { match: /jordan/i, label: '约旦' },
  { match: /ghana/i, label: '加纳' },
  { match: /georgia/i, label: '格鲁吉亚' },
  { match: /chile/i, label: '智利' },
]

const BUY_VERBS = 'added|bought|purchased|(?:having\\s+)?accumulated'
const SELL_VERBS = 'sold|offloading|sold a net'

function countryLabelFromBank(raw: string): string | null {
  const text = raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  for (const item of BANK_COUNTRY_ZH) {
    if (item.match.test(text)) return item.label
  }
  return null
}

/**
 * Extract monthly country-level official gold activity from a WGC Gold Focus article.
 * Returns net-buyer slices for pie composition (sellers excluded).
 */
export function parseWgcCountryBuyers(html: string): FactorBreakdownSlice[] {
  const buys = new Map<string, number>()
  const sells = new Set<string>()

  const strongRe = new RegExp(
    `<strong>([^<]{2,90})</strong>[\\s\\S]{0,120}?(?:${BUY_VERBS}|${SELL_VERBS})\\s+(\\d+(?:\\.\\d+)?)\\s*t`,
    'gi',
  )
  for (const m of html.matchAll(strongRe)) {
    const bank = m[1] ?? ''
    const tonnes = Number(m[2])
    const label = countryLabelFromBank(bank)
    if (!label || !Number.isFinite(tonnes) || tonnes <= 0) continue
    const verb = m[0].toLowerCase()
    const isSell = /sold|offloading/.test(verb)
    if (isSell) {
      sells.add(label)
      continue
    }
    buys.set(label, Math.max(buys.get(label) ?? 0, tonnes))
  }

  // Summary paren form: "Poland (18t) and China (10t)" / sellers "Turkey (3t) and Russia (6t)"
  for (const m of html.matchAll(
    /\b(Poland|China|Turkey|Russia|India|Singapore|Uzbekistan|Kazakhstan)\s*\((\d+(?:\.\d+)?)\s*t\)/gi,
  )) {
    const label = countryLabelFromBank(m[1] ?? '')
    const tonnes = Number(m[2])
    if (!label || !Number.isFinite(tonnes) || tonnes <= 0) continue
    const window = html.slice(Math.max(0, (m.index ?? 0) - 80), (m.index ?? 0) + 40).toLowerCase()
    if (/seller|sold|sales|offloading/.test(window)) {
      sells.add(label)
      continue
    }
    if (!buys.has(label)) buys.set(label, tonnes)
  }

  for (const label of sells) buys.delete(label)

  return [...buys.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
}

const MONTH_NUM: Record<string, string> = {
  january: '01',
  february: '02',
  march: '03',
  april: '04',
  may: '05',
  june: '06',
  july: '07',
  august: '08',
  september: '09',
  october: '10',
  november: '11',
  december: '12',
}

async function fetchSpotGold(): Promise<FactorMetric> {
  const base = {
    id: 'xau-usd',
    label: '现货金价',
    shortLabel: 'XAU',
    description: '无对手方计价锚 · 近实时现货代理',
    cadence: 'realtime' as const,
    unit: 'USD/oz',
    source: '新浪财经 hf_XAU',
    goldFriendlyWhen: 'context' as const,
  }

  try {
    const raw = await httpGetText('https://hq.sinajs.cn/list=hf_XAU')
    const q = parseSinaHfXau(raw)
    return metricBase({
      ...base,
      value: q.value,
      previousValue: q.previous,
      asOf: q.asOf,
    })
  } catch (primaryErr) {
    try {
      const live = await httpGetJson<GoldApiPrice>('https://api.gold-api.com/price/XAU')
      if (!isRecord(live) || typeof live.price !== 'number') {
        throw new Error('金价响应无效')
      }
      return metricBase({
        ...base,
        source: 'gold-api.com（新浪回退）',
        value: live.price,
        previousValue: null,
        asOf: typeof live.updatedAt === 'string' ? live.updatedAt : new Date().toISOString(),
      })
    } catch {
      return metricBase({
        ...base,
        error: errorMessage(primaryErr) || '金价拉取失败',
      })
    }
  }
}

async function fetchShanghaiGold(): Promise<FactorMetric> {
  const base = {
    id: 'shfe-au',
    label: '上海沪金',
    shortLabel: 'AU0',
    description: '上期所黄金连续合约 · 元/克',
    cadence: 'realtime' as const,
    unit: 'CNY/g',
    source: '新浪财经 nf_AU0',
    goldFriendlyWhen: 'context' as const,
  }

  try {
    const raw = await httpGetText('https://hq.sinajs.cn/list=nf_AU0')
    const q = parseSinaNfAu0(raw)
    return metricBase({
      ...base,
      description: `${q.name} · 上期所 · 元/克`,
      value: q.value,
      previousValue: q.previous,
      asOf: q.asOf,
    })
  } catch (e) {
    return metricBase({
      ...base,
      error: errorMessage(e) || '沪金拉取失败',
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

async function fetchRiskProxyFromSina(): Promise<FactorMetric> {
  const raw = await httpGetText('https://hq.sinajs.cn/list=gb_vixy')
  const q = parseSinaGbStock(raw, 'gb_vixy')
  return metricBase({
    id: 'vix-proxy',
    label: '风险偏好代理',
    shortLabel: 'VIXY',
    description: 'VIXY ETF · VIX 弱代理（非 VIX 现货指数）',
    cadence: 'realtime',
    unit: 'USD',
    source: '新浪财经 gb_vixy',
    goldFriendlyWhen: 'up',
    value: q.value,
    previousValue: q.previous,
    asOf: q.asOf,
  })
}

async function fetchRiskProxyFromEastmoney(): Promise<FactorMetric> {
  const raw = await httpGetText(
    'https://push2delay.eastmoney.com/api/qt/stock/get?secid=107.VIXY&fields=f43,f57,f58,f60,f169,f170',
  )
  const json: unknown = JSON.parse(raw)
  if (!isRecord(json) || !isRecord(json.data)) {
    throw new Error('VIXY 响应无效')
  }
  const data = json.data
  const last = typeof data.f43 === 'number' ? data.f43 / 1000 : null
  const prev = typeof data.f60 === 'number' ? data.f60 / 1000 : null
  if (last === null) throw new Error('VIXY 无最新价')
  return metricBase({
    id: 'vix-proxy',
    label: '风险偏好代理',
    shortLabel: 'VIXY',
    description: 'VIXY ETF · VIX 弱代理（非 VIX 现货指数）',
    cadence: 'realtime',
    unit: 'USD',
    source: '东方财富 push2delay',
    goldFriendlyWhen: 'up',
    value: last,
    previousValue: prev,
    asOf: new Date().toISOString(),
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
    source: '新浪 / 东财',
    goldFriendlyWhen: 'up' as const,
  }

  try {
    return await fetchRiskProxyFromSina()
  } catch (primaryErr) {
    try {
      return await fetchRiskProxyFromEastmoney()
    } catch {
      return metricBase({
        ...base,
        error: errorMessage(primaryErr) || '风险代理拉取失败',
      })
    }
  }
}

async function fetchCentralBankGold(): Promise<FactorMetric> {
  const base = {
    id: 'cb-gold',
    label: '央行净购金',
    shortLabel: 'CB',
    description: '官方储备月度净变动 · WGC 月报（滞后约 1–2 月）',
    cadence: 'monthly' as const,
    unit: 't',
    source: 'World Gold Council',
    goldFriendlyWhen: 'up' as const,
  }

  try {
    const listing = await httpGetText('https://www.gold.org/goldhub/gold-focus')
    const links = [
      ...listing.matchAll(
        /href="(\/goldhub\/gold-focus\/\d{4}\/\d{2}\/central-bank-gold-statistics[^"]*)"/g,
      ),
    ].map((m) => m[1]!)

    const unique = [...new Set(links)].slice(0, 2)
    if (unique.length === 0) throw new Error('未找到 WGC 央行购金月报')

    const articles = (
      await Promise.all(
        unique.map(async (path) => {
          const html = await httpGetText(`https://www.gold.org${path}`)
          const parsed = parseWgcCentralBankNetTonnes(html)
          if (!parsed) return null
          const yearMatch = path.match(/\/(\d{4})\/(\d{2})\//)
          const pubYear = yearMatch ? Number(yearMatch[1]) : NaN
          const pubMonth = yearMatch ? Number(yearMatch[2]) : NaN
          const mm = MONTH_NUM[parsed.periodLabel.toLowerCase()]
          let asOf = parsed.periodLabel
          if (mm && Number.isFinite(pubYear)) {
            let year = pubYear
            const dataMonth = Number(mm)
            if (Number.isFinite(pubMonth) && dataMonth > pubMonth) year -= 1
            asOf = `${year}-${mm}`
          }
          return {
            ...parsed,
            asOf,
            path,
            breakdown: parseWgcCountryBuyers(html),
          }
        }),
      )
    ).filter((x): x is NonNullable<typeof x> => x != null)

    const [current, previous] = articles
    if (!current) throw new Error('WGC 月报解析失败')

    return metricBase({
      ...base,
      description: `全球央行月度净购金 · ${current.periodLabel}（WGC，滞后发布）`,
      value: current.value,
      previousValue: previous?.value ?? null,
      asOf: current.asOf,
      source: 'WGC Gold Focus',
      breakdown: current.breakdown.length > 0 ? current.breakdown : undefined,
    })
  } catch (e) {
    return metricBase({
      ...base,
      error: errorMessage(e) || '央行购金拉取失败',
    })
  }
}

/**
 * Uses China-reachable sources (Treasury XML + Sina + WGC).
 * FRED is intentionally not primary — often blocked / HTTP2-unstable.
 */
export async function fetchGoldFactorsSnapshot(): Promise<GoldFactorsSnapshot> {
  const [spotGold, shanghaiGold, dxy, nominal10y, realYield, risk, cbGold] = await Promise.all([
    fetchSpotGold(),
    fetchShanghaiGold(),
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
    fetchCentralBankGold(),
  ])

  const breakeven = buildBreakeven(nominal10y, realYield)

  return {
    fetchedAt: new Date().toISOString(),
    metrics: [spotGold, realYield, dxy, breakeven, nominal10y, risk, cbGold],
    spotGold: spotGold.value !== null ? spotGold : null,
    shanghaiGold: shanghaiGold.value !== null ? shanghaiGold : null,
  }
}

/** Fast path: only Sina-backed near-realtime quotes (safe for sub-second polling). */
export async function fetchRealtimeGoldFactors(): Promise<{
  fetchedAt: string
  spotGold: FactorMetric
  shanghaiGold: FactorMetric
  dxy: FactorMetric
  risk: FactorMetric
}> {
  const [spotGold, shanghaiGold, dxy, risk] = await Promise.all([
    fetchSpotGold(),
    fetchShanghaiGold(),
    fetchDxy(),
    fetchRiskProxy(),
  ])
  return {
    fetchedAt: new Date().toISOString(),
    spotGold,
    shanghaiGold,
    dxy,
    risk,
  }
}

// Keep export for unit-style reuse / future FRED fallback experiments.
export { lastTwo }
