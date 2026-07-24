import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  applyThemeTokens,
  themes,
  type ThemeName,
  type ThemeTokens,
} from './tokens'

interface ThemeContextValue {
  theme: ThemeName
  tokens: ThemeTokens
  setTheme: (name: ThemeName) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

interface ThemeProviderProps {
  children: ReactNode
  defaultTheme?: ThemeName
}

export function ThemeProvider({
  children,
  defaultTheme = 'dark-zinc',
}: ThemeProviderProps) {
  const [theme, setTheme] = useState<ThemeName>(defaultTheme)
  const tokens = themes[theme]

  useEffect(() => {
    applyThemeTokens(tokens)
  }, [tokens])

  const value = useMemo(
    () => ({
      theme,
      tokens,
      setTheme,
    }),
    [theme, tokens],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) {
    throw new Error('useTheme must be used within ThemeProvider')
  }
  return ctx
}
