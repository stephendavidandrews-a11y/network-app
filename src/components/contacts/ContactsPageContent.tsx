'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { Grid, List, Search, Filter, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TIER_COLORS, STATUS_COLORS, STATUS_LABELS, CATEGORIES } from '@/lib/constants'
import { formatRelativeDate } from '@/lib/utils'

interface ContactRow {
  id: string
  name: string
  title: string | null
  organization: string | null
  email: string | null
  tier: number
  categories: string[]
  tags: string[]
  status: string
  lastInteractionDate: string | null
  daysSinceInteraction: number | null
  isOverdue: boolean
  relationshipStrength: number
  strategicValue: number
  targetCadenceDays: number
}

interface Props {
  contacts: ContactRow[]
  categoryCounts: Record<string, number>
  filters: {
    tier?: string
    status?: string
    overdue: boolean
    search?: string
    sort: string
  }
}

export function ContactsPageContent({ contacts, categoryCounts, filters }: Props) {
  const router = useRouter()
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid')
  const [searchQuery, setSearchQuery] = useState(filters.search || '')

  const updateFilter = (key: string, value: string | null) => {
    const params = new URLSearchParams()
    const current = {
      tier: filters.tier,
      status: filters.status,
      overdue: filters.overdue ? 'true' : undefined,
      search: filters.search,
      sort: filters.sort,
    }
    Object.entries({ ...current, [key]: value }).forEach(([k, v]) => {
      if (v) params.set(k, v)
    })
    router.push(`/contacts?${params.toString()}`)
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    updateFilter('search', searchQuery || null)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Contacts</h1>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">{contacts.length} contacts</span>
          <div className="flex rounded-md border">
            <button
              onClick={() => setViewMode('grid')}
              className={cn('p-1.5 rounded-l-md', viewMode === 'grid' ? 'bg-gray-100' : 'hover:bg-gray-50')}
            >
              <Grid className="h-4 w-4 text-gray-600" />
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={cn('p-1.5 rounded-r-md', viewMode === 'table' ? 'bg-gray-100' : 'hover:bg-gray-50')}
            >
              <List className="h-4 w-4 text-gray-600" />
            </button>
          </div>
          <Link
            href="/contacts/new"
            className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            Add Contact
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <form onSubmit={handleSearch} className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-9 w-64 rounded-md border bg-white pl-10 pr-4 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </form>

        {/* Tier filter */}
        {[1, 2, 3].map(t => (
          <button
            key={t}
            onClick={() => updateFilter('tier', filters.tier === String(t) ? null : String(t))}
            className={cn(
              'rounded-md border px-2.5 py-1 text-xs font-medium transition-colors',
              filters.tier === String(t)
                ? TIER_COLORS[t]
                : 'text-gray-500 hover:bg-gray-50'
            )}
          >
            Tier {t}
          </button>
        ))}

        {/* Status filter */}
        {Object.entries(STATUS_LABELS).map(([value, label]) => (
          <button
            key={value}
            onClick={() => updateFilter('status', filters.status === value ? null : value)}
            className={cn(
              'rounded-md border px-2.5 py-1 text-xs font-medium transition-colors',
              filters.status === value
                ? 'bg-gray-800 text-white border-gray-800'
                : 'text-gray-500 hover:bg-gray-50'
            )}
          >
            {label}
          </button>
        ))}

        <button
          onClick={() => updateFilter('overdue', filters.overdue ? null : 'true')}
          className={cn(
            'rounded-md border px-2.5 py-1 text-xs font-medium transition-colors',
            filters.overdue
              ? 'bg-red-600 text-white border-red-600'
              : 'text-gray-500 hover:bg-gray-50'
          )}
        >
          Overdue Only
        </button>

        {/* Sort */}
        <select
          value={filters.sort}
          onChange={(e) => updateFilter('sort', e.target.value)}
          className="rounded-md border px-2 py-1 text-xs text-gray-600 bg-white"
        >
          <option value="tier">Sort: Tier</option>
          <option value="name">Sort: Name</option>
          <option value="last_interaction">Sort: Last Interaction</option>
          <option value="strategic_value">Sort: Strategic Value</option>
          <option value="relationship">Sort: Relationship Strength</option>
          <option value="created">Sort: Date Added</option>
        </select>
      </div>

      {/* Grid View */}
      {viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {contacts.map(contact => (
            <Link
              key={contact.id}
              href={`/contacts/${contact.id}`}
              className="rounded-lg border bg-white p-4 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={cn('inline-flex h-5 items-center rounded border px-1.5 text-xs font-medium', TIER_COLORS[contact.tier])}>
                      T{contact.tier}
                    </span>
                    <h3 className="text-sm font-semibold text-gray-900 truncate">{contact.name}</h3>
                  </div>
                  {contact.title && <p className="text-xs text-gray-500 mt-0.5 truncate">{contact.title}</p>}
                  {contact.organization && <p className="text-xs text-gray-400 truncate">{contact.organization}</p>}
                </div>
                <div className="flex items-center gap-1.5 ml-2">
                  <span className={cn('h-2 w-2 rounded-full', STATUS_COLORS[contact.status] || 'bg-gray-300')} />
                  {contact.isOverdue && (
                    <span className="h-2 w-2 rounded-full ring-2 ring-red-400 ring-offset-1" />
                  )}
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between text-xs text-gray-400">
                <span>Last: {formatRelativeDate(contact.lastInteractionDate)}</span>
                <span>
                  {contact.daysSinceInteraction !== null ? `${contact.daysSinceInteraction}d` : '—'} / {contact.targetCadenceDays}d
                </span>
              </div>

              {contact.categories.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {contact.categories.slice(0, 2).map(cat => (
                    <span key={cat} className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">{cat}</span>
                  ))}
                  {contact.categories.length > 2 && (
                    <span className="text-xs text-gray-400">+{contact.categories.length - 2}</span>
                  )}
                </div>
              )}
            </Link>
          ))}
        </div>
      ) : (
        /* Table View */
        <div className="overflow-x-auto rounded-lg border bg-white">
          <table className="w-full text-sm">
            <thead className="border-b bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left font-medium text-gray-500">Name</th>
                <th className="px-4 py-2 text-left font-medium text-gray-500">Organization</th>
                <th className="px-4 py-2 text-center font-medium text-gray-500">Tier</th>
                <th className="px-4 py-2 text-left font-medium text-gray-500">Status</th>
                <th className="px-4 py-2 text-left font-medium text-gray-500">Last Contact</th>
                <th className="px-4 py-2 text-center font-medium text-gray-500">Strength</th>
                <th className="px-4 py-2 text-center font-medium text-gray-500">Value</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {contacts.map(contact => (
                <tr key={contact.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2">
                    <Link href={`/contacts/${contact.id}`} className="font-medium text-gray-900 hover:text-blue-600">
                      {contact.name}
                    </Link>
                    {contact.title && <p className="text-xs text-gray-400">{contact.title}</p>}
                  </td>
                  <td className="px-4 py-2 text-gray-600">{contact.organization || '—'}</td>
                  <td className="px-4 py-2 text-center">
                    <span className={cn('inline-flex h-5 items-center rounded border px-1.5 text-xs font-medium', TIER_COLORS[contact.tier])}>
                      T{contact.tier}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-1.5">
                      <span className={cn('h-2 w-2 rounded-full', STATUS_COLORS[contact.status] || 'bg-gray-300')} />
                      <span className="text-gray-600 text-xs">{STATUS_LABELS[contact.status]}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2">
                    <span className={cn('text-xs', contact.isOverdue ? 'text-red-500 font-medium' : 'text-gray-500')}>
                      {formatRelativeDate(contact.lastInteractionDate)}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-center text-xs text-gray-500">{contact.relationshipStrength.toFixed(1)}</td>
                  <td className="px-4 py-2 text-center text-xs text-gray-500">{contact.strategicValue.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
