import { createContext, useContext, type ReactNode } from 'react'

const ToolVisibilityContext = createContext(true)

export function ToolVisibilityProvider({
  active,
  children,
}: {
  active: boolean
  children: ReactNode
}) {
  return (
    <ToolVisibilityContext.Provider value={active}>
      {children}
    </ToolVisibilityContext.Provider>
  )
}

export function useToolVisible() {
  return useContext(ToolVisibilityContext)
}
