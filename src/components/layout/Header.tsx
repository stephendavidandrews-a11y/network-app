'use client'

import { Search, Plus } from 'lucide-react'
import Link from 'next/link'
import { CommandPalette } from '@/components/CommandPalette'

export function Header() {
  const openPalette = () => {
    window.dispatchEvent(new CustomEvent('open-command-palette'))
  }

  return (
    <>
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-white px-6">
        <div className="flex items-center gap-4 flex-1">
          <button
            onClick={openPalette}
            className="relative max-w-md flex-1 text-left"
          >
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <div className="h-9 w-full rounded-md border border-gray-200 bg-gray-50 pl-10 pr-4 flex items-center text-sm text-gray-400">
              Search contacts, events, signals...
              <kbd className="ml-auto rounded border border-gray-300 px-1.5 py-0.5 text-[10px] font-mono text-gray-400">
                Ctrl+K
              </kbd>
            </div>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/contacts/new"
            className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Add Contact
          </Link>
          <Link
            href="/interactions/new"
            className="flex items-center gap-1.5 rounded-md border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Log Interaction
          </Link>
        </div>
      </header>
      <CommandPalette />
    </>
  )
}
