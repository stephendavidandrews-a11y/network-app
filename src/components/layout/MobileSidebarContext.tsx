'use client'

import { createContext, useContext, useState, useCallback } from 'react'

interface MobileSidebarContextType {
  isOpen: boolean
  open: () => void
  close: () => void
}

const MobileSidebarContext = createContext<MobileSidebarContextType>({
  isOpen: false,
  open: () => {},
  close: () => {},
})

export function MobileSidebarProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const open = useCallback(() => setIsOpen(true), [])
  const close = useCallback(() => setIsOpen(false), [])

  return (
    <MobileSidebarContext.Provider value={{ isOpen, open, close }}>
      {children}
    </MobileSidebarContext.Provider>
  )
}

export function useMobileSidebar() {
  return useContext(MobileSidebarContext)
}
