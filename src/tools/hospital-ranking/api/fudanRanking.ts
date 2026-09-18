import { errorMessage, httpGetText } from './http'
import type {
  HospitalEntry,
  HospitalGrade,
  HospitalRankingSnapshot,
} from '../types'
import { GRADE_ORDER } from '../types'

const BASE = 'https://rank.cn-healthcare.com/fudan/national-general'
const SOURCE = '复旦大学医院管理研究所 · 健康界 rank.cn-healthcare.com'
const DEFAULT_NOTE = '同一级别不分先后，以行政编码和笔画为序'
/** 复旦榜自 2023 起改为 A++++…A 等级制（与图二一致） */
const GRADE_ERA_START = 2023

const GRADE_SET = new Set<string>(GRADE_ORDER)

function decodeEntities(raw: string): string {
  return raw
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) =>
      String.fromCharCode(Number.parseInt(h, 16)),
    )
}

function cleanCell(raw: string): string {
  const noComments = raw.replace(/<!--[\s\S]*?-->/g, '')
  const noTags = noComments.replace(/<[^>]+>/g, ' ')
  return decodeEntities(noTags).replace(/\s+/g, ' ').trim()
}

/** Parse `#select-year` options from the ranking page. */
export function parseAvailableYears(html: string): {
  years: number[]
  selected: number | null
} {
  const block = html.match(
    /id=["']select-year["'][^>]*>([\s\S]*?)<\/select>/i,
  )
  if (!block?.[1]) return { years: [], selected: null }

  const years: number[] = []
  let selected: number | null = null
  for (const m of block[1].matchAll(
    /<option[^>]*value=["'](20\d{2})["']([^>]*)>/gi,
  )) {
    const year = Number(m[1])
    if (!Number.isFinite(year)) continue
    years.push(year)
    if (/\bselected\b/i.test(m[2] ?? '')) selected = year
  }
  return {
    years: [...new Set(years)]
      .filter((y) => y >= GRADE_ERA_START)
      .sort((a, b) => b - a),
    selected:
      selected != null && selected >= GRADE_ERA_START ? selected : null,
  }
}

export function parseGradeNote(html: string): string {
  const m = html.match(
    /同一级别不分先后[^<\n]{0,40}/,
  )
  return m?.[0]?.trim() || DEFAULT_NOTE
}

/**
 * Parse the graded Fudan table (等级 | 医院) introduced in 2023.
 * Returns null when the page still uses the old numeric-rank layout.
 */
export function parseGradeHospitalTable(html: string): HospitalEntry[] | null {
  const table = html.match(
    /<table[^>]*class=["'][^"']*rank-table[^"']*["'][^>]*>([\s\S]*?)<\/table>/i,
  )
  if (!table?.[1]) return null

  const head = table[1].match(/<thead[\s\S]*?<\/thead>/i)?.[0] ?? table[1].slice(0, 800)
  if (!/等级/.test(head) || !/医院/.test(head)) return null

  const rows = table[1].match(/<tr[\s\S]*?<\/tr>/gi) ?? []
  const hospitals: HospitalEntry[] = []

  for (const row of rows) {
    const cells = [...row.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(
      (m) => cleanCell(m[1] ?? ''),
    )
    if (cells.length < 2) continue
    const gradeRaw = cells[0] ?? ''
    const name = cells[1] ?? ''
    if (!GRADE_SET.has(gradeRaw) || !name || name === '医院') continue
    hospitals.push({ grade: gradeRaw as HospitalGrade, name })
  }

  return hospitals.length > 0 ? hospitals : null
}

function rankingUrl(year?: number): string {
  if (year && year > 0) return `${BASE}/year/${year}`
  return BASE
}

async function loadYearPage(year?: number): Promise<{
  html: string
  year: number
  years: number[]
}> {
  const html = await httpGetText(rankingUrl(year))
  const { years, selected } = parseAvailableYears(html)
  const resolved =
    year && years.includes(year)
      ? year
      : selected ?? years[0] ?? year ?? new Date().getFullYear() - 1
  return { html, year: resolved, years }
}

/**
 * Fetch Fudan national general ranking for a year.
 * When `year` is omitted, uses the site's currently selected (latest published) year,
 * falling back through available years until a graded table is found.
 */
export async function fetchFudanHospitalRanking(
  year?: number,
): Promise<HospitalRankingSnapshot> {
  try {
    if (year != null) {
      const page = await loadYearPage(year)
      const hospitals = parseGradeHospitalTable(page.html)
      if (!hospitals) {
        throw new Error(
          `${page.year} 年度尚未采用「等级」制榜单，或页面暂无数据`,
        )
      }
      return {
        year: page.year,
        years: page.years,
        note: parseGradeNote(page.html),
        source: SOURCE,
        hospitals,
        fetchedAt: new Date().toISOString(),
      }
    }

    const latestPage = await loadYearPage()
    const candidates = latestPage.years.length
      ? latestPage.years
      : [latestPage.year]

    let lastError = '未找到可用的等级制榜单'
    for (const y of candidates) {
      try {
        const page =
          y === latestPage.year
            ? latestPage
            : await loadYearPage(y)
        const hospitals = parseGradeHospitalTable(page.html)
        if (!hospitals) {
          lastError = `${y} 年度无等级制数据`
          continue
        }
        return {
          year: page.year,
          years: page.years.length ? page.years : candidates,
          note: parseGradeNote(page.html),
          source: SOURCE,
          hospitals,
          fetchedAt: new Date().toISOString(),
        }
      } catch (e) {
        lastError = errorMessage(e) || lastError
      }
    }
    throw new Error(lastError)
  } catch (e) {
    throw new Error(errorMessage(e) || '医院排行榜拉取失败')
  }
}
