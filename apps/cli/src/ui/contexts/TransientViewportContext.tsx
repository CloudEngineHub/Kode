import * as React from 'react'

export type TransientViewportConstraints = {
  /**
   * Maximum number of rows transient (actively changing) transcript content
   * should occupy. When undefined, components should fall back to their own
   * defaults.
   */
  maxHeight?: number
}

const TransientViewportContext =
  React.createContext<TransientViewportConstraints>({})

export function TransientViewportProvider({
  value,
  children,
}: {
  value: TransientViewportConstraints
  children: React.ReactNode
}): React.ReactNode {
  return (
    <TransientViewportContext.Provider value={value}>
      {children}
    </TransientViewportContext.Provider>
  )
}

export function useTransientViewport(): TransientViewportConstraints {
  return React.useContext(TransientViewportContext)
}
