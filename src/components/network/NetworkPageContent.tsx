'use client'

import Link from 'next/link'
import { cn } from '@/lib/utils'
import { TIER_COLORS, CATEGORIES } from '@/lib/constants'
import { Network, Users } from 'lucide-react'

interface Props {
  contacts: Array<{
    id: string
    name: string
    organization: string | null
    tier: number
    categories: string[]
    strategicValue: number
  }>
  relationships: Array<{
    id: string
    contactAId: string
    contactBId: string
    relationshipType: string | null
    strength: number
  }>
  categoryCounts: Record<string, number>
}

const CATEGORY_TARGETS: Record<string, number> = {
  'Crypto VC': 8,
  'Crypto Exchanges': 5,
  'Crypto Legal': 8,
  'Crypto Policy': 6,
  'DeFi': 5,
  'Prediction Markets': 8,
  'Traditional Finance': 5,
  'Think Tanks & Policy': 8,
  'Administrative Law': 6,
  'Former CFTC': 5,
  'Media & Journalists': 5,
  'Academia': 3,
  'Law Firms': 5,
}

export function NetworkPageContent({ contacts, relationships, categoryCounts }: Props) {
  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Network</h1>
        <div className="flex items-center gap-4 text-sm text-gray-500">
          <span>{contacts.length} contacts</span>
          <span>{relationships.length} connections</span>
        </div>
      </div>

      {/* Network Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border bg-white p-4">
          <p className="text-xs font-medium text-gray-500 uppercase">Tier 1</p>
          <p className="text-2xl font-bold text-amber-500">{contacts.filter(c => c.tier === 1).length}</p>
        </div>
        <div className="rounded-lg border bg-white p-4">
          <p className="text-xs font-medium text-gray-500 uppercase">Tier 2</p>
          <p className="text-2xl font-bold text-blue-500">{contacts.filter(c => c.tier === 2).length}</p>
        </div>
        <div className="rounded-lg border bg-white p-4">
          <p className="text-xs font-medium text-gray-500 uppercase">Tier 3</p>
          <p className="text-2xl font-bold text-gray-400">{contacts.filter(c => c.tier === 3).length}</p>
        </div>
      </div>

      {/* Network Graph Placeholder */}
      <div className="rounded-lg border bg-white p-8 text-center">
        <Network className="h-12 w-12 mx-auto mb-3 text-gray-300" />
        <p className="text-gray-500">Interactive network graph</p>
        <p className="text-xs text-gray-400 mt-1">Force-directed visualization will be added in Phase 5 (react-force-graph)</p>
      </div>

      {/* Gap Analysis */}
      <div className="rounded-lg border bg-white p-6">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">Category Coverage Analysis</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {CATEGORIES.map(cat => {
            const count = categoryCounts[cat] || 0
            const target = CATEGORY_TARGETS[cat] || 3
            const pct = Math.min(count / target, 1)
            const status = pct >= 0.8 ? 'green' : pct >= 0.4 ? 'amber' : 'red'

            return (
              <div key={cat} className="flex items-center gap-3 p-2 rounded hover:bg-gray-50">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-700 truncate">{cat}</span>
                    <span className={cn('text-xs font-medium',
                      status === 'green' ? 'text-green-600' : status === 'amber' ? 'text-amber-600' : 'text-red-600')}>
                      {count} / {target}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-gray-100">
                    <div
                      className={cn('h-full rounded-full',
                        status === 'green' ? 'bg-green-500' : status === 'amber' ? 'bg-amber-500' : 'bg-red-500')}
                      style={{ width: `${pct * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Connections List */}
      {relationships.length > 0 && (
        <div className="rounded-lg border bg-white p-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Connections ({relationships.length})</h2>
          <div className="space-y-1 max-h-80 overflow-y-auto">
            {relationships.map(rel => {
              const a = contacts.find(c => c.id === rel.contactAId)
              const b = contacts.find(c => c.id === rel.contactBId)
              if (!a || !b) return null
              return (
                <div key={rel.id} className="flex items-center justify-between text-sm py-1">
                  <div className="flex items-center gap-2">
                    <Link href={`/contacts/${a.id}`} className="text-gray-900 hover:text-blue-600">{a.name}</Link>
                    <span className="text-gray-400">—</span>
                    <Link href={`/contacts/${b.id}`} className="text-gray-900 hover:text-blue-600">{b.name}</Link>
                  </div>
                  <span className="text-xs text-gray-400">{rel.relationshipType?.replace(/_/g, ' ')}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
