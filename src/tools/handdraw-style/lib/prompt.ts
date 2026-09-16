import { HANDDRAW_STYLES, type HanddrawStyle } from '../data/styles'

export function parseStyleNumber(raw: string): string | null {
  const match = raw.trim().match(/^#?\s*0*([1-9]\d{0,2})$/)
  if (!match?.[1]) return null
  const padded = String(Number(match[1])).padStart(3, '0')
  return HANDDRAW_STYLES.some((item) => item.number === padded) ? padded : null
}

export function findStyle(raw: string): HanddrawStyle | null {
  const number = parseStyleNumber(raw)
  if (!number) return null
  return HANDDRAW_STYLES.find((item) => item.number === number) ?? null
}

export function buildPrompts(style: HanddrawStyle, theme: string) {
  const trimmed = theme.trim()
  return {
    zh: `风格名称：#${style.number} · ${style.generationName}。主题：${trimmed}。参考作者/风格名称：${style.reference}。`,
    en: `Style name: #${style.number} · ${style.generationName}. Theme: ${trimmed}. Reference author/style name: ${style.reference}.`,
  }
}
