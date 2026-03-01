'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useCallback } from 'react'
import { Grid, List, Search, Plus, Download, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TIER_COLORS, STATUS_COLORS, STATUS_LABELS } from '@/lib/constants'
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
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkUpdating, setBulkUpdating] = useState(false)

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

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selected.size === contacts.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(contacts.map(c => c.id)))
    }
  }

  const bulkUpdate = useCallback(async (updates: { tier?: number; status?: string }) => {
    if (selected.size === 0) return
    setBulkUpdating(true)
    try {
      await fetch('/api/contacts/bulk', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selected), updates }),
      })
      setSelected(new Set())
      router.refresh()
    } finally {
      setBulkUpdating(false)
    }
  }, [selected, router])

  const exportSelected = useCallback(async () => {
    const res = await fetch('/api/contacts/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: selected.size > 0 ? Array.from(selected) : undefined }),
    })
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `contacts-export-${new Date().toISOString().split('T')[0]}.xlsx`
    a.click()
    URL.revokeObjectURL(url)
  }, [selected])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Contacts</h1>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">{contacts.length} contacts</span>
          <button
            onClick={exportSelected}
            className="flex items-center gap-1.5 rounded-md border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            title={selected.size > 0 ? `Export ${selected.size} selected` : 'Export all'}
          >
            <Download className="h-4 w-4" />
            Export
          </button>
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

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2">
          <span className="text-sm font-medium text-blue-700">{selected.size} selected</span>
          <div className="h-4 w-px bg-blue-200" />
          <select
            disabled={bulkUpdating}
            onChange={e => { if (e.target.value) bulkUpdate({ tier: Number(e.target.value) }); e.target.value = '' }}
            className="rounded border px-2 py-1 text-xs bg-white text-gray-700"
            defaultValue=""
          >
            <option value="" disabled>Set Tier...</option>
            <option value="1">Tier 1</option>
            <option value="2">Tier 2</option>
            <option value="3">Tier 3</option>
          </select>
          <select
            disabled={bulkUpdating}
            onChange={e => { if (e.target.value) bulkUpdate({ status: e.target.value }); e.target.value = '' }}
            className="rounded border px-2 py-1 text-xs bg-white text-gray-700"
            defaultValue=""
          >
            <option value="" disabled>Set Status...</option>
            {Object.entries(STATUS_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
          <button onClick={exportSelected} className="rounded border px-2 py-1 text-xs bg-white text-gray-700 hover:bg-gray-50 flex items-center gap-1">
            <Download className="h-3 w-3" /> Export Selected
          </button>
          <button onClick={() => setSelected(new Set())} className="ml-auto rounded p-1 hover:bg-blue-100">
            <X className="h-3 w-3 text-blue-600" />
          </button>
        </div>
      )}

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

        {[1, 2, 3].map(t => (
          <button
            key={t}
            onClick={() => updateFilter('tier', filters.tier === String(t) ? null : String(t))}
            className={cn(
              'rounded-md border px-2.5 py-1 text-xs font-medium transition-colors',
              filters.tier === String(t) ? TIER_COLORS[t] : 'text-gray-500 hover:bg-gray-50'
            )}
          >
            Tier {t}
          </button>
        ))}

        {Object.entries(STATUS_LABELS).map(([value, label]) => (
          <button
            key={value}
            onClick={() => updateFilter('status', filters.status === value ? null : value)}
            className={cn(
              'rounded-md border px-2.5 py-1 text-xs font-medium transition-colors',
              filters.status === value ? 'bg-gray-800 text-white border-gray-800' : 'text-gray-500 hover:bg-gray-50'
            )}
          >
            {label}
          </button>
        ))}

        <button
          onClick={() => updateFilter('overdue', filters.overdue ? null : 'true')}
          className={cn(
            'rounded-md border px-2.5 py-1 text-xs font-medium transition-colors',
            filters.overdue ? 'bg-red-600 text-white border-red-600' : 'text-gray-500 hover:bg-gray-50'
          )}
        >
          Overdue Only
        </button>

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
            <div key={contact.id} className={cn('rounded-lg border bg-white p-4 hover:shadow-md transition-shadow relative', selected.has(contact.id) && 'ring-2 ring-blue-400')}>
              <input
                type="checkbox"
                checked={selected.has(contact.id)}
                onChange={() => toggleSelect(contact.id)}
                className="absolute top-3 right-3 h-4 w-4 rounded border-gray-300"
              />
              <Link href={`/contacts/${contact.id}`}>
                <div className="flex items-start justify-between pr-6">
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
                    {contact.daysSinceInteraction !== null ? `${contact.daysSinceInteraction}d` : '\u2014'} / {contact.targetCadenceDays}d
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
            </div>
          ))}
        </div>
      ) : (
        /* Table View */
        <div className="overflow-x-auto rounded-lg border bg-white">
          <table className="w-full text-sm">
            <thead className="border-b bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-center">
                  <input
                    type="checkbox"
                    checked={selected.size === contacts.length && contacts.length > 0}
                    onChange={toggleSelectAll}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                </th>
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
                <tr key={contact.id} className={cn('hover:bg-gray-50', selected.has(contact.id) && 'bg-blue-50')}>
                  <td className="px-3 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={selected.has(contact.id)}
                      onChange={() => toggleSelect(contact.id)}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                  </td>
                  <td className="px-4 py-2">
                    <Link href={`/contacts/${contact.id}`} className="font-medium text-gray-900 hover:text-blue-600">
                      {contact.name}
                    </Link>
                    {contact.title && <p className="text-xs text-gray-400">{contact.title}</p>}
                  </td>
                  <td className="px-4 py-2 text-gray-600">{contact.organization || '\u2014'}</td>
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
