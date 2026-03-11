'use client'

import { Search, Plus, Menu } from 'lucide-react'
import Link from 'next/link'
import { CommandPalette } from '@/components/CommandPalette'
import { useMobileSidebar } from './MobileSidebarContext'

export function Header() {
  const { open } = useMobileSidebar()

  const openPalette = () => {
    window.dispatchEvent(new CustomEvent('open-command-palette'))
  }

  return (
    <>
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-white px-3 md:px-6">
        <div className="flex items-center gap-2 md:gap-4 flex-1">
          {/* Hamburger menu — mobile only */}
          <button
            onClick={open}
            className="md:hidden rounded-md p-1.5 -ml-1 hover:bg-gray-100"
          >
            <Menu className="h-5 w-5 text-gray-600" />
          </button>

          <button
            onClick={openPalette}
            className="relative max-w-md flex-1 text-left"
          >
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <div className="h-9 w-full rounded-md border border-gray-200 bg-gray-50 pl-10 pr-4 flex items-center text-sm text-gray-400">
              <span className="hidden sm:inline">Search contacts, events, signals...</span>
              <span className="sm:hidden">Search...</span>
              <kbd className="ml-auto rounded border border-gray-300 px-1.5 py-0.5 text-[10px] font-mono text-gray-400 hidden sm:inline-block">
                Ctrl+K
              </kbd>
            </div>
          </button>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2">
          <Link
            href="/contacts/new"
            className="flex items-center gap-1.5 rounded-md bg-blue-600 px-2 sm:px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Add Contact</span>
          </Link>
          <Link
            href="/interactions/new"
            className="flex items-center gap-1.5 rounded-md border border-gray-200 px-2 sm:px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Log Interaction</span>
          </Link>
        </div>
      </header>
      <CommandPalette />
    </>
  )
}
