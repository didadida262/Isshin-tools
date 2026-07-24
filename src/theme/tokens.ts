export interface ThemeTokens {
  bg: string
  surface: string
  surfaceHover: string
  border: string
  borderSubtle: string
  fg: string
  muted: string
  subtle: string
  accent: string
  accentFg: string
  danger: string
  dangerFg: string
  success: string
}

export const darkZincTheme: ThemeTokens = {
  bg: '#09090b',
  surface: '#18181b',
  surfaceHover: '#27272a',
  border: '#3f3f46',
  borderSubtle: '#27272a',
  fg: '#fafafa',
  muted: '#a1a1aa',
  subtle: '#71717a',
  accent: '#d4d4d8',
  accentFg: '#09090b',
  danger: '#fca5a5',
  dangerFg: '#450a0a',
  success: '#86efac',
}

export type ThemeName = 'dark-zinc'

export const themes: Record<ThemeName, ThemeTokens> = {
  'dark-zinc': darkZincTheme,
}

export function applyThemeTokens(tokens: ThemeTokens, root: HTMLElement = document.documentElement) {
  root.style.setProperty('--bg', tokens.bg)
  root.style.setProperty('--surface', tokens.surface)
  root.style.setProperty('--surface-hover', tokens.surfaceHover)
  root.style.setProperty('--border', tokens.border)
  root.style.setProperty('--border-subtle', tokens.borderSubtle)
  root.style.setProperty('--fg', tokens.fg)
  root.style.setProperty('--muted', tokens.muted)
  root.style.setProperty('--subtle', tokens.subtle)
  root.style.setProperty('--accent', tokens.accent)
  root.style.setProperty('--accent-fg', tokens.accentFg)
  root.style.setProperty('--danger', tokens.danger)
  root.style.setProperty('--danger-fg', tokens.dangerFg)
  root.style.setProperty('--success', tokens.success)
}
