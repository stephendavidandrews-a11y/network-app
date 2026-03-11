'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowRight, Check, X, Sparkles } from 'lucide-react'

interface PersonalContact {
  id: string
  name: string
  phone: string | null
  email: string | null
  photoUrl: string | null
  contactType: string
  personalRing: string
  personalCadenceDays: number
  howWeMet: string | null
  city: string | null
  neighborhood: string | null
  funnelStage: string | null
  lastInteractionDate: string | null
  daysSinceInteraction: number | null
  isOverdue: boolean
  groups: string[]
  notes: string | null
  suggestedRing: string | null
  suggestedFunnel: string | null
  commScore: number
}

interface Props {
  contacts: PersonalContact[]
  groups: { id: string; name: string; memberCount: number }[]
  filters: {
    ring?: string
    group?: string
    overdue: boolean
    search?: string
    sort: string
  }
  suggestionCount?: number
  funnelSuggestionCount?: number
}

const RING_COLORS: Record<string, string> = {
  close: 'bg-purple-100 text-purple-700 border-purple-200',
  regular: 'bg-blue-100 text-blue-700 border-blue-200',
  outer: 'bg-gray-100 text-gray-600 border-gray-200',
  new: 'bg-green-100 text-green-700 border-green-200',
}

const FUNNEL_LABELS: Record<string, string> = {
  new_acquaintance: 'New',
  party_contact: 'Party',
  happy_hour: 'Happy Hour',
  dinner: 'Dinner',
  close_friend: 'Close',
}

export function PersonalContactsContent({ contacts, groups, filters, suggestionCount = 0, funnelSuggestionCount = 0 }: Props) {
  const router = useRouter()
  const [sortBy, setSortBy] = useState('name')
  const [cityFilter, setCityFilter] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set())
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set())
  const [hiddenFunnelIds, setHiddenFunnelIds] = useState<Set<string>>(new Set())
  const searchParams = useSearchParams()

  const setFilter = (key: string, value: string | null) => {
    const params = new URLSearchParams(searchParams.toString())
    if (value) {
      params.set(key, value)
    } else {
      params.delete(key)
    }
    router.push(`/social/friends?${params.toString()}`)
  }

  const handleRingSuggestion = async (contactId: string, action: 'accept' | 'dismiss', suggestedRing: string) => {
    setProcessingIds(prev => new Set(prev).add(contactId))
    try {
      await fetch('/api/social/ring-suggestion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactId, action, suggestedRing }),
      })
      if (action === 'accept') {
        router.refresh()
      } else {
        // Hide dismissed suggestion without full reload
        setHiddenIds(prev => new Set(prev).add(contactId))
      }
    } catch (err) {
      console.error('Ring suggestion error:', err)
    } finally {
      setProcessingIds(prev => {
        const next = new Set(prev)
        next.delete(contactId)
        return next
      })
    }
  }

  const handleFunnelSuggestion = async (contactId: string, action: 'accept' | 'dismiss', suggestedFunnel: string) => {
    setProcessingIds(prev => new Set(prev).add(`funnel-${contactId}`))
    try {
      await fetch('/api/social/funnel-suggestion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactId, action, suggestedFunnel }),
      })
      if (action === 'accept') {
        router.refresh()
      } else {
        setHiddenFunnelIds(prev => new Set(prev).add(contactId))
      }
    } catch (err) {
      console.error('Funnel suggestion error:', err)
    } finally {
      setProcessingIds(prev => {
        const next = new Set(prev)
        next.delete(`funnel-${contactId}`)
        return next
      })
    }
  }

  // City filter options
  const cities = [...new Set(contacts.filter(c => c.city).map(c => c.city!))].sort()

  // Apply city filter + sort + suggestion filter
  let displayList = contacts
  if (cityFilter) {
    displayList = displayList.filter(c => c.city === cityFilter)
  }
  if (showSuggestions) {
    displayList = displayList.filter(c => c.suggestedRing && !hiddenIds.has(c.id))
  }
  displayList = [...displayList].sort((a, b) => {
    if (sortBy === 'name') return a.name.localeCompare(b.name)
    if (sortBy === 'last_contact') return (a.daysSinceInteraction ?? 999) - (b.daysSinceInteraction ?? 999)
    if (sortBy === 'overdue') {
      const aOver = (a.daysSinceInteraction ?? 999) - a.personalCadenceDays
      const bOver = (b.daysSinceInteraction ?? 999) - b.personalCadenceDays
      return bOver - aOver
    }
    if (sortBy === 'ring') {
      const order: Record<string, number> = { close: 0, regular: 1, new: 2, outer: 3 }
      return (order[a.personalRing] ?? 4) - (order[b.personalRing] ?? 4)
    }
    if (sortBy === 'comm_score') return b.commScore - a.commScore
    return 0
  })

  const visibleSuggestionCount = contacts.filter(c => c.suggestedRing && !hiddenIds.has(c.id)).length

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Friends</h1>
          <p className="text-sm text-gray-500">{contacts.length} personal contacts</p>
        </div>
        <Link href="/social/friends/new" className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
          Add Friend
        </Link>
      </div>

      {/* Ring Suggestions Banner */}
      {visibleSuggestionCount > 0 && (
        <button
          onClick={() => setShowSuggestions(!showSuggestions)}
          className={`w-full flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm transition-colors ${
            showSuggestions
              ? 'bg-amber-50 border-amber-200 text-amber-800'
              : 'bg-amber-50/50 border-amber-100 text-amber-700 hover:bg-amber-50'
          }`}
        >
          <Sparkles className="h-4 w-4" />
          <span className="font-medium">{visibleSuggestionCount} ring suggestion{visibleSuggestionCount !== 1 ? 's' : ''}</span>
          <span className="text-amber-600/70">based on texting activity</span>
          <ArrowRight className={`h-3.5 w-3.5 ml-auto transition-transform ${showSuggestions ? 'rotate-90' : ''}`} />
        </button>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {/* Sort & City Filter */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-500">Sort:</span>
            <select value={sortBy} onChange={e => setSortBy(e.target.value)}
              className="rounded border border-gray-200 bg-white px-2 py-1 text-xs text-gray-600">
              <option value="name">Name</option>
              <option value="last_contact">Last Contact</option>
              <option value="overdue">Most Overdue</option>
              <option value="ring">Ring</option>
              <option value="comm_score">Comm Score</option>
            </select>
          </div>
          {cities.length > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-gray-500">City:</span>
              <select value={cityFilter} onChange={e => setCityFilter(e.target.value)}
                className="rounded border border-gray-200 bg-white px-2 py-1 text-xs text-gray-600">
                <option value="">All Cities</option>
                {cities.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          )}
        </div>

        {/* Ring filter */}
        {['close', 'regular', 'outer', 'new'].map(ring => (
          <button
            key={ring}
            onClick={() => setFilter('ring', filters.ring === ring ? null : ring)}
            className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
              filters.ring === ring ? RING_COLORS[ring] : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            }`}
          >
            {ring}
          </button>
        ))}
        <span className="text-gray-300">|</span>
        <button
          onClick={() => setFilter('overdue', filters.overdue ? null : 'true')}
          className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
            filters.overdue ? 'bg-red-100 text-red-700 border-red-200' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
          }`}
        >
          Overdue
        </button>
        {/* Group filter */}
        {groups.length > 0 && (
          <select
            value={filters.group || ''}
            onChange={e => setFilter('group', e.target.value || null)}
            className="rounded-full px-3 py-1 text-xs border border-gray-200 bg-white"
          >
            <option value="">All groups</option>
            {groups.map(g => (
              <option key={g.id} value={g.id}>{g.name} ({g.memberCount})</option>
            ))}
          </select>
        )}
        {/* Search */}
        <input
          type="text"
          placeholder="Search..."
          defaultValue={filters.search || ''}
          onChange={e => {
            if (e.target.value.length === 0 || e.target.value.length >= 2) {
              setFilter('search', e.target.value || null)
            }
          }}
          className="rounded-full px-3 py-1 text-xs border border-gray-200 w-40"
        />
      </div>

      {/* Contact grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {displayList.map(c => (
          <div
            key={c.id}
            className={`rounded-lg bg-white p-4 shadow-sm hover:shadow-md transition-shadow border-l-4 ${
              c.isOverdue ? 'border-l-red-400' : 'border-l-transparent'
            }`}
          >
            <Link href={`/contacts/${c.id}`}>
              <div className="flex items-start justify-between">
                <div className="font-medium text-gray-900">{c.name}</div>
                <div className="flex items-center gap-1">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${RING_COLORS[c.personalRing] || RING_COLORS.new}`}>
                    {c.personalRing}
                  </span>
                </div>
              </div>
              {c.city && <div className="text-xs text-gray-500 mt-0.5">{c.city}</div>}
              {c.howWeMet && <div className="text-xs text-gray-400 mt-0.5">{c.howWeMet}</div>}
              <div className="flex items-center justify-between mt-3">
                <div className="text-xs text-gray-500">
                  {c.daysSinceInteraction !== null
                    ? `${c.daysSinceInteraction}d ago`
                    : 'Never contacted'}
                  <span className="text-gray-300"> / {c.personalCadenceDays}d</span>
                </div>
                {c.funnelStage && (
                  <span className="text-[10px] text-gray-400">
                    {FUNNEL_LABELS[c.funnelStage] || c.funnelStage}
                  </span>
                )}
              </div>
              {c.groups.length > 0 && (
                <div className="flex gap-1 mt-2 flex-wrap">
                  {c.groups.map(g => (
                    <span key={g} className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600">{g}</span>
                  ))}
                </div>
              )}
            </Link>

            {/* Ring suggestion inline */}
            {c.suggestedRing && !hiddenIds.has(c.id) && (
              <div className="mt-2 flex items-center gap-2 rounded border border-amber-200 bg-amber-50 px-2.5 py-1.5">
                <Sparkles className="h-3 w-3 text-amber-500 flex-shrink-0" />
                <span className="text-[11px] text-amber-800 flex-1">
                  Move to <span className={`font-semibold ${
                    c.suggestedRing === 'close' ? 'text-purple-700' :
                    c.suggestedRing === 'regular' ? 'text-blue-700' :
                    c.suggestedRing === 'outer' ? 'text-gray-700' : 'text-green-700'
                  }`}>{c.suggestedRing}</span>?
                  <span className="text-amber-600/60 ml-1">(score: {c.commScore})</span>
                </span>
                <button
                  onClick={(e) => { e.preventDefault(); handleRingSuggestion(c.id, 'accept', c.suggestedRing!) }}
                  disabled={processingIds.has(c.id)}
                  className="rounded p-0.5 text-green-600 hover:bg-green-100 transition-colors disabled:opacity-50"
                  title="Accept"
                >
                  <Check className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={(e) => { e.preventDefault(); handleRingSuggestion(c.id, 'dismiss', c.suggestedRing!) }}
                  disabled={processingIds.has(c.id)}
                  className="rounded p-0.5 text-gray-400 hover:bg-gray-100 transition-colors disabled:opacity-50"
                  title="Dismiss"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {/* Funnel suggestion inline */}
            {c.suggestedFunnel && !hiddenFunnelIds.has(c.id) && (
              <div className="mt-2 flex items-center gap-2 rounded border border-purple-200 bg-purple-50 px-2.5 py-1.5">
                <Sparkles className="h-3 w-3 text-purple-500 flex-shrink-0" />
                <span className="text-[11px] text-purple-800 flex-1">
                  Promote to <span className="font-semibold text-purple-700">
                    {FUNNEL_LABELS[c.suggestedFunnel] || c.suggestedFunnel}
                  </span>?
                </span>
                <button
                  onClick={(e) => { e.preventDefault(); handleFunnelSuggestion(c.id, 'accept', c.suggestedFunnel!) }}
                  disabled={processingIds.has(`funnel-${c.id}`)}
                  className="rounded p-0.5 text-green-600 hover:bg-green-100 transition-colors disabled:opacity-50"
                  title="Accept"
                >
                  <Check className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={(e) => { e.preventDefault(); handleFunnelSuggestion(c.id, 'dismiss', c.suggestedFunnel!) }}
                  disabled={processingIds.has(`funnel-${c.id}`)}
                  className="rounded p-0.5 text-gray-400 hover:bg-gray-100 transition-colors disabled:opacity-50"
                  title="Dismiss"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {contacts.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          <p>No friends match your filters.</p>
          <Link href="/social/friends/new" className="text-blue-600 hover:text-blue-800 text-sm mt-2 inline-block">
            Add your first friend
          </Link>
        </div>
      )}
    </div>
  )
}
