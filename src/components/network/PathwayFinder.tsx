'use client'

import { useState, useCallback } from 'react'
import Link from 'next/link'
import { Search, ArrowRight, Route } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TIER_COLORS } from '@/lib/constants'
import { formatRelativeDate } from '@/lib/utils'

interface Contact {
  id: string
  name: string
  organization: string | null
  tier: number
}

interface PathNode {
  id: string
  name: string
  organization: string | null
  tier: number
  lastInteractionDate: string | null
}

interface PathEdge {
  from: string
  to: string
  type: string
  strength: number
}

interface PathResult {
  hops: number
  nodes: PathNode[]
  edges: PathEdge[]
}

export function PathwayFinder({ contacts }: { contacts: Contact[] }) {
  const [fromId, setFromId] = useState('')
  const [toId, setToId] = useState('')
  const [fromSearch, setFromSearch] = useState('')
  const [toSearch, setToSearch] = useState('')
  const [paths, setPaths] = useState<PathResult[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)

  const filteredFrom = contacts.filter(c =>
    c.name.toLowerCase().includes(fromSearch.toLowerCase()) ||
    (c.organization || '').toLowerCase().includes(fromSearch.toLowerCase())
  ).slice(0, 8)

  const filteredTo = contacts.filter(c =>
    c.name.toLowerCase().includes(toSearch.toLowerCase()) ||
    (c.organization || '').toLowerCase().includes(toSearch.toLowerCase())
  ).slice(0, 8)

  const findPaths = useCallback(async () => {
    if (!fromId || !toId) return
    setLoading(true)
    setSearched(true)
    try {
      const res = await fetch(`/api/network/pathways?from=${fromId}&to=${toId}`)
      const data = await res.json()
      setPaths(data.paths || [])
    } catch {
      setPaths([])
    } finally {
      setLoading(false)
    }
  }, [fromId, toId])

  const selectFrom = (c: Contact) => { setFromId(c.id); setFromSearch(c.name) }
  const selectTo = (c: Contact) => { setToId(c.id); setToSearch(c.name) }

  return (
    <div className="rounded-lg border bg-white p-6">
      <h2 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
        <Route className="h-4 w-4" />
        Pathway Finder
      </h2>
      <p className="text-xs text-gray-500 mb-4">Find the shortest introduction path between two contacts.</p>

      <div className="flex items-end gap-3 mb-4">
        <div className="flex-1">
          <label className="text-xs font-medium text-gray-500 block mb-1">From</label>
          <div className="relative">
            <input
              type="text"
              value={fromSearch}
              onChange={e => { setFromSearch(e.target.value); setFromId('') }}
              placeholder="Search contact..."
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
            {fromSearch.length >= 2 && !fromId && (
              <div className="absolute z-10 mt-1 w-full rounded-md border bg-white shadow-lg max-h-48 overflow-y-auto">
                {filteredFrom.map(c => (
                  <button key={c.id} onClick={() => selectFrom(c)} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50">
                    <span className="font-medium">{c.name}</span>
                    {c.organization && <span className="text-gray-500 ml-1">({c.organization})</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <ArrowRight className="h-5 w-5 text-gray-400 mb-2" />

        <div className="flex-1">
          <label className="text-xs font-medium text-gray-500 block mb-1">To</label>
          <div className="relative">
            <input
              type="text"
              value={toSearch}
              onChange={e => { setToSearch(e.target.value); setToId('') }}
              placeholder="Search contact..."
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
            {toSearch.length >= 2 && !toId && (
              <div className="absolute z-10 mt-1 w-full rounded-md border bg-white shadow-lg max-h-48 overflow-y-auto">
                {filteredTo.map(c => (
                  <button key={c.id} onClick={() => selectTo(c)} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50">
                    <span className="font-medium">{c.name}</span>
                    {c.organization && <span className="text-gray-500 ml-1">({c.organization})</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <button
          onClick={findPaths}
          disabled={!fromId || !toId || loading}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap"
        >
          {loading ? 'Searching...' : 'Find Path'}
        </button>
      </div>

      {/* Results */}
      {searched && !loading && paths.length === 0 && (
        <p className="text-sm text-gray-500 text-center py-4">No paths found between these contacts.</p>
      )}

      {paths.length > 0 && (
        <div className="space-y-3">
          {paths.map((path, i) => (
            <div key={i} className="rounded-lg border p-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs font-medium text-gray-500">Path {i + 1}</span>
                <span className="rounded bg-blue-50 px-1.5 py-0.5 text-xs text-blue-600">{path.hops} hop{path.hops !== 1 ? 's' : ''}</span>
              </div>
              <div className="flex items-center gap-1 flex-wrap">
                {path.nodes.map((node, j) => (
                  <div key={node.id} className="flex items-center gap-1">
                    <Link href={`/contacts/${node.id}`} className="group">
                      <div className="rounded-lg border px-3 py-2 hover:border-blue-300 hover:bg-blue-50 transition-colors">
                        <div className="flex items-center gap-1.5">
                          <span className={cn('inline-flex h-4 items-center rounded px-1 text-[10px] font-medium', TIER_COLORS[node.tier])}>
                            T{node.tier}
                          </span>
                          <span className="text-sm font-medium text-gray-900 group-hover:text-blue-600">{node.name}</span>
                        </div>
                        {node.organization && <p className="text-xs text-gray-500 mt-0.5">{node.organization}</p>}
                        {node.lastInteractionDate && (
                          <p className="text-[10px] text-gray-400 mt-0.5">Last: {formatRelativeDate(node.lastInteractionDate)}</p>
                        )}
                      </div>
                    </Link>
                    {j < path.nodes.length - 1 && (
                      <div className="flex flex-col items-center px-1">
                        <ArrowRight className="h-3 w-3 text-gray-300" />
                        <span className="text-[9px] text-gray-400">{path.edges[j]?.type.replace(/_/g, ' ')}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
