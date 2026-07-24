import { errorMessage, httpGetText } from '../api/http'

export interface GoldReserveRow {
  rank: number
  country: string
  countryEn: string
  tonnes: number
  asOf: string
}

const SKIP_ENTITIES = new Set([
  'euro area',
  'imf',
  'world',
  'bis',
  'ecb',
  'european central bank',
])

const COUNTRY_ZH: Record<string, string> = {
  'United States': '美国',
  Germany: '德国',
  Italy: '意大利',
  France: '法国',
  China: '中国',
  Russia: '俄罗斯',
  Switzerland: '瑞士',
  India: '印度',
  Japan: '日本',
  Netherlands: '荷兰',
  Poland: '波兰',
  Turkey: '土耳其',
  Taiwan: '中国台湾',
  Uzbekistan: '乌兹别克斯坦',
  'Saudi Arabia': '沙特阿拉伯',
  'United Kingdom': '英国',
  Spain: '西班牙',
  Austria: '奥地利',
  Belgium: '比利时',
  Kazakhstan: '哈萨克斯坦',
  Portugal: '葡萄牙',
  Singapore: '新加坡',
  Brazil: '巴西',
  Mexico: '墨西哥',
  Thailand: '泰国',
  Australia: '澳大利亚',
  Iraq: '伊拉克',
  Venezuela: '委内瑞拉',
  Libya: '利比亚',
  Algeria: '阿尔及利亚',
  Philippines: '菲律宾',
  Sweden: '瑞典',
  'South Africa': '南非',
  Greece: '希腊',
  Hungary: '匈牙利',
  Romania: '罗马尼亚',
  Korea: '韩国',
  'South Korea': '韩国',
  Indonesia: '印尼',
  Egypt: '埃及',
  Qatar: '卡塔尔',
  Kuwait: '科威特',
  Denmark: '丹麦',
  Pakistan: '巴基斯坦',
  Argentina: '阿根廷',
  Finland: '芬兰',
  Belarus: '白俄罗斯',
  Bolivia: '玻利维亚',
  Bulgaria: '保加利亚',
  Ukraine: '乌克兰',
  'United Arab Emirates': '阿联酋',
  Canada: '加拿大',
}

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, ' ')
    .trim()
}

/** Parse Trading Economics country-list/gold-reserves HTML into ranked holdings. */
export function parseTradingEconomicsGoldReserves(html: string): GoldReserveRow[] {
  const tables = html.match(/<table[\s\S]*?<\/table>/gi) ?? []
  const dataTable =
    tables.find((t) => /United States/i.test(t) && /Tonnes/i.test(t)) ?? tables[1] ?? tables[0]
  if (!dataTable) return []

  const rows = dataTable.match(/<tr[\s\S]*?<\/tr>/gi) ?? []
  const out: GoldReserveRow[] = []

  for (const row of rows) {
    const cells = [...row.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((m) =>
      stripTags(m[1] ?? ''),
    )
    if (cells.length < 5) continue
    const countryEn = cells[0] ?? ''
    const tonnes = Number((cells[1] ?? '').replace(/,/g, ''))
    const asOf = cells[3] ?? ''
    const unit = (cells[4] ?? '').toLowerCase()
    if (!countryEn || !Number.isFinite(tonnes)) continue
    if (countryEn.toLowerCase().includes('country')) continue
    if (!unit.includes('tonne')) continue
    if (SKIP_ENTITIES.has(countryEn.toLowerCase())) continue

    out.push({
      rank: 0,
      countryEn,
      country: COUNTRY_ZH[countryEn] ?? countryEn,
      tonnes,
      asOf,
    })
  }

  out.sort((a, b) => b.tonnes - a.tonnes)
  return out.slice(0, 10).map((row, i) => ({ ...row, rank: i + 1 }))
}

export async function fetchTopGoldReserves(): Promise<{
  rows: GoldReserveRow[]
  source: string
  fetchedAt: string
}> {
  try {
    const html = await httpGetText('https://tradingeconomics.com/country-list/gold-reserves')
    const rows = parseTradingEconomicsGoldReserves(html)
    if (rows.length === 0) throw new Error('未解析到储备排名')
    return {
      rows,
      source: 'Trading Economics（IMF IFS）',
      fetchedAt: new Date().toISOString(),
    }
  } catch (e) {
    throw new Error(errorMessage(e) || '黄金储备排名拉取失败')
  }
}
