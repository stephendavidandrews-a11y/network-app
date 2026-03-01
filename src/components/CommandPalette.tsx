'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Search, User, Calendar, MessageSquare, Zap, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TIER_COLORS } from '@/lib/constants'

interface SearchResult {
  type: 'contact' | 'event' | 'interaction' | 'signal'
  id: string
  title: string
  subtitle: string | null
  href: string
  tier?: number
}

const TYPE_ICONS = {
  contact: User,
  event: Calendar,
  interaction: MessageSquare,
  signal: Zap,
}

const TYPE_LABELS = {
  contact: 'Contact',
  event: 'Event',
  interaction: 'Interaction',
  signal: 'Signal',
}

export function CommandPalette() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>()

  // Keyboard shortcut: Cmd+K / Ctrl+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(prev => !prev)
      }
      if (e.key === 'Escape') {
        setOpen(false)
      }
    }
    const handleOpen = () => setOpen(true)
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('open-command-palette', handleOpen)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('open-command-palette', handleOpen)
    }
  }, [])

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50)
      setQuery('')
      setResults([])
      setSelectedIndex(0)
    }
  }, [open])

  // Search debounce
  const search = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults([])
      return
    }
    setLoading(true)
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`)
      const data = await res.json()
      setResults(data.results || [])
      setSelectedIndex(0)
    } catch {
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => search(query), 200)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query, search])

  const navigate = (result: SearchResult) => {
    setOpen(false)
    router.push(result.href)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex(prev => Math.min(prev + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex(prev => Math.max(prev - 1, 0))
    } else if (e.key === 'Enter' && results[selectedIndex]) {
      navigate(results[selectedIndex])
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />

      {/* Dialog */}
      <div className="relative w-full max-w-lg rounded-xl bg-white shadow-2xl border overflow-hidden">
        {/* Search input */}
        <div className="flex items-center border-b px-4">
          <Search className="h-4 w-4 text-gray-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search contacts, events, signals..."
            className="flex-1 border-0 bg-transparent px-3 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-0"
          />
          <button onClick={() => setOpen(false)} className="rounded p-1 hover:bg-gray-100">
            <X className="h-4 w-4 text-gray-400" />
          </button>
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-y-auto">
          {loading && (
            <div className="px-4 py-3 text-sm text-gray-400">Searching...</div>
          )}

          {!loading && query.length >= 2 && results.length === 0 && (
            <div className="px-4 py-6 text-center text-sm text-gray-400">No results found</div>
          )}

          {!loading && results.length > 0 && (
            <div className="py-1">
              {results.map((result, idx) => {
                const Icon = TYPE_ICONS[result.type]
                return (
                  <button
                    key={`${result.type}-${result.id}`}
                    onClick={() => navigate(result)}
                    className={cn(
                      'flex items-center gap-3 w-full px-4 py-2.5 text-left text-sm hover:bg-gray-50',
                      idx === selectedIndex && 'bg-blue-50'
                    )}
                  >
                    <Icon className="h-4 w-4 text-gray-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {result.tier && (
                          <span className={cn('inline-flex h-4 items-center rounded px-1 text-[10px] font-medium', TIER_COLORS[result.tier])}>
                            T{result.tier}
                          </span>
                        )}
                        <span className="text-gray-900 truncate">{result.title}</span>
                      </div>
                      {result.subtitle && (
                        <p className="text-xs text-gray-400 truncate">{result.subtitle}</p>
                      )}
                    </div>
                    <span className="text-[10px] text-gray-300 uppercase">{TYPE_LABELS[result.type]}</span>
                  </button>
                )
              })}
            </div>
          )}

          {!loading && query.length < 2 && (
            <div className="px-4 py-6 text-center text-sm text-gray-400">
              Type to search across all data
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t px-4 py-2 flex items-center gap-3 text-[10px] text-gray-400">
          <span><kbd className="rounded border px-1 py-0.5 font-mono">↑↓</kbd> navigate</span>
          <span><kbd className="rounded border px-1 py-0.5 font-mono">↵</kbd> select</span>
          <span><kbd className="rounded border px-1 py-0.5 font-mono">esc</kbd> close</span>
        </div>
      </div>
    </div>
  )
}
