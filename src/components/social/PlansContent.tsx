'use client'

import Link from 'next/link'
import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Check, X, Calendar, Clock, ChevronDown, Send, Copy, RefreshCw,
  Plus, Search, UserPlus, Pencil, MapPin, FileText, MessageSquare,
} from 'lucide-react'

interface SuggestedContact {
  contactId: string
  name: string
  phone: string | null
  ring: string
  funnelStage: string | null
  score: number
  reasoning: string
  hooks: string[]
  draftText?: string
  voiceSource?: string
  sentAt?: string
  responseStatus?: string
}

interface Venue {
  id: string
  name: string
  venueType: string
  city: string | null
}

interface Plan {
  id: string
  planType: string
  targetDate: string
  suggestedContacts: SuggestedContact[]
  suggestedVenueId: string | null
  alternativeVenueIds: string[]
  groupReasoning: string
  status: string
  approvedAt: string | null
  completedAt: string | null
  createdAt: string
  venue: Venue | null
  // Merged from SocialEvent
  title: string | null
  time: string | null
  notes: string | null
  publicVisibility: boolean
  location: string | null
  description: string | null
  coHosted: boolean
}

interface PlansData {
  plans: Plan[]
  venues: Venue[]
  contacts: { id: string; name: string }[]
}

const PLAN_TYPE_META: Record<string, { icon: string; label: string; color: string }> = {
  happy_hour: { icon: '🍺', label: 'Happy Hour', color: 'bg-amber-50 border-amber-200' },
  golf: { icon: '⛳', label: 'Golf', color: 'bg-green-50 border-green-200' },
  dinner: { icon: '🍽️', label: 'Dinner', color: 'bg-rose-50 border-rose-200' },
  party: { icon: '🎉', label: 'Party', color: 'bg-purple-50 border-purple-200' },
}

const RING_COLORS: Record<string, string> = {
  close: 'bg-purple-100 text-purple-700',
  regular: 'bg-blue-100 text-blue-700',
  outer: 'bg-gray-100 text-gray-700',
  new: 'bg-green-100 text-green-700',
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-blue-100 text-blue-700',
  modified: 'bg-indigo-100 text-indigo-700',
  skipped: 'bg-gray-100 text-gray-500',
  completed: 'bg-green-100 text-green-700',
  postponed: 'bg-orange-100 text-orange-700',
  invites_sent: 'bg-cyan-100 text-cyan-700',
  confirmed: 'bg-emerald-100 text-emerald-700',
  cancelled: 'bg-red-100 text-red-700',
}

const RESPONSE_ICONS: Record<string, string> = {
  accepted: '✅',
  declined: '❌',
  maybe: '🤔',
  pending: '❓',
}

interface SearchResult {
  id: string
  name: string
  personalRing: string | null
  city: string | null
}

export function PlansContent({ data }: { data: PlansData }) {
  const router = useRouter()
  const [tab, setTab] = useState<'active' | 'past'>('active')
  const [generating, setGenerating] = useState(false)
  const [genType, setGenType] = useState('happy_hour')
  const [genDate, setGenDate] = useState(getDefaultDate())
  const [draftingPlanId, setDraftingPlanId] = useState<string | null>(null)
  const [sendingPlanId, setSendingPlanId] = useState<string | null>(null)
  const [sendingContactId, setSendingContactId] = useState<string | null>(null)
  const [addingToPlanId, setAddingToPlanId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [editingDraftKey, setEditingDraftKey] = useState<string | null>(null) // "planId:contactId"
  const [editDraftText, setEditDraftText] = useState('')
  const [editingVenueId, setEditingVenueId] = useState<string | null>(null) // planId being edited
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null)
  const [editTitleText, setEditTitleText] = useState('')
  const [editingNotesId, setEditingNotesId] = useState<string | null>(null)
  const [editNotesText, setEditNotesText] = useState('')
  // Manual plan creation
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [createType, setCreateType] = useState('happy_hour')
  const [createDate, setCreateDate] = useState(getDefaultDate())
  const [createTitle, setCreateTitle] = useState('')
  const [createVenueId, setCreateVenueId] = useState('')
  const [createContactIds, setCreateContactIds] = useState<string[]>([])
  const [createSearchQuery, setCreateSearchQuery] = useState('')
  const [createSearchResults, setCreateSearchResults] = useState<SearchResult[]>([])
  const [creating, setCreating] = useState(false)
  // Writing draft from scratch
  const [writingDraftKey, setWritingDraftKey] = useState<string | null>(null)
  const [writeDraftText, setWriteDraftText] = useState('')

  const activePlans = data.plans.filter(p => ['pending', 'modified', 'approved', 'invites_sent', 'confirmed'].includes(p.status))
  const pastPlans = data.plans.filter(p => ['completed', 'skipped', 'postponed', 'cancelled'].includes(p.status))

  const displayPlans = tab === 'active' ? activePlans : pastPlans

  const isEditable = (status: string) => !['completed', 'skipped', 'postponed', 'cancelled'].includes(status)

  async function handleGenerate() {
    setGenerating(true)
    try {
      await fetch('/api/social/plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'generate', planType: genType, targetDate: genDate }),
      })
      router.refresh()
    } catch (err) {
      console.error('Generate error:', err)
    }
    setGenerating(false)
  }

  async function handleCreateManual() {
    setCreating(true)
    try {
      await fetch('/api/social/plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_manual',
          planType: createType,
          targetDate: createDate,
          title: createTitle || null,
          venueId: createVenueId || null,
          contactIds: createContactIds,
        }),
      })
      setShowCreateForm(false)
      setCreateTitle('')
      setCreateVenueId('')
      setCreateContactIds([])
      router.refresh()
    } catch (err) {
      console.error('Create error:', err)
    }
    setCreating(false)
  }

  async function handleAction(planId: string, action: string, extra?: Record<string, unknown>) {
    try {
      await fetch(`/api/social/plans/${planId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...extra }),
      })
      router.refresh()
    } catch (err) {
      console.error('Action error:', err)
    }
  }

  async function handleGenerateDrafts(planId: string) {
    setDraftingPlanId(planId)
    try {
      await fetch('/api/social/plans/draft-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId, action: 'generate' }),
      })
      router.refresh()
    } catch (err) {
      console.error('Draft error:', err)
    }
    setDraftingPlanId(null)
  }

  async function handleSendAll(planId: string) {
    if (!confirm('Send all draft messages via iMessage?')) return
    setSendingPlanId(planId)
    try {
      await fetch('/api/social/plans/draft-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId, action: 'send' }),
      })
      router.refresh()
    } catch (err) {
      console.error('Send error:', err)
    }
    setSendingPlanId(null)
  }

  async function handleSendOne(planId: string, contactId: string, contactName: string) {
    if (!confirm(`Send draft text to ${contactName} via iMessage?`)) return
    setSendingContactId(contactId)
    try {
      await fetch('/api/social/plans/draft-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId, contactId, action: 'send_one' }),
      })
      router.refresh()
    } catch (err) {
      console.error('Send one error:', err)
    }
    setSendingContactId(null)
  }

  const handleSearchContacts = useCallback(async (query: string, forCreate = false) => {
    if (forCreate) {
      setCreateSearchQuery(query)
    } else {
      setSearchQuery(query)
    }
    if (query.length < 2) {
      if (forCreate) setCreateSearchResults([])
      else setSearchResults([])
      return
    }
    setSearching(true)
    try {
      const res = await fetch(`/api/contacts?search=${encodeURIComponent(query)}&limit=8`)
      if (res.ok) {
        const data = await res.json()
        const results = data.contacts || data || []
        if (forCreate) setCreateSearchResults(results)
        else setSearchResults(results)
      }
    } catch (err) {
      console.error('Search error:', err)
    }
    setSearching(false)
  }, [])

  async function handleAddContact(planId: string, contactId: string) {
    await handleAction(planId, 'add_contact', { contactId })
    setAddingToPlanId(null)
    setSearchQuery('')
    setSearchResults([])
  }

  async function handleSaveDraft(planId: string, contactId: string, draftText: string) {
    try {
      await fetch(`/api/social/plans/${planId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update_draft_text', contactId, draftText }),
      })
      setEditingDraftKey(null)
      setEditDraftText('')
      setWritingDraftKey(null)
      setWriteDraftText('')
      router.refresh()
    } catch (err) {
      console.error('Save draft error:', err)
    }
  }

  async function handleSwapVenue(planId: string, venueId: string) {
    await handleAction(planId, 'swap_venue', { venueId })
    setEditingVenueId(null)
  }

  async function handleSaveTitle(planId: string, title: string) {
    await handleAction(planId, 'update_details', { title: title || null })
    setEditingTitleId(null)
  }

  async function handleSaveNotes(planId: string, notes: string) {
    await handleAction(planId, 'update_details', { notes: notes || null })
    setEditingNotesId(null)
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Plans</h1>
        <Link href="/social" className="text-sm text-blue-600 hover:text-blue-800">&larr; Dashboard</Link>
      </div>

      {/* Create New Plan */}
      <div className="rounded-lg bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-700">New Plan</h2>
          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="text-xs text-blue-600 hover:text-blue-800"
          >
            {showCreateForm ? 'Hide Manual' : 'Create Manually'}
          </button>
        </div>

        {/* AI Generate */}
        <div className="flex flex-wrap items-end gap-3 mb-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Type</label>
            <div className="relative">
              <select
                value={genType}
                onChange={e => setGenType(e.target.value)}
                className="appearance-none rounded border border-gray-300 bg-white px-3 py-2 pr-8 text-sm focus:border-blue-500 focus:outline-none"
              >
                <option value="happy_hour">🍺 Happy Hour</option>
                <option value="golf">⛳ Golf</option>
                <option value="dinner">🍽️ Dinner</option>
                <option value="party">🎉 Party</option>
              </select>
              <ChevronDown className="absolute right-2 top-2.5 h-4 w-4 text-gray-400 pointer-events-none" />
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Target Date</label>
            <input
              type="date"
              value={genDate}
              onChange={e => setGenDate(e.target.value)}
              className="rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {generating ? 'Generating...' : 'AI Generate'}
          </button>
        </div>

        {/* Manual Create Form */}
        {showCreateForm && (
          <div className="border-t border-gray-100 pt-3 space-y-3">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Type</label>
                <div className="relative">
                  <select
                    value={createType}
                    onChange={e => setCreateType(e.target.value)}
                    className="appearance-none rounded border border-gray-300 bg-white px-3 py-2 pr-8 text-sm focus:border-blue-500 focus:outline-none"
                  >
                    <option value="happy_hour">🍺 Happy Hour</option>
                    <option value="golf">⛳ Golf</option>
                    <option value="dinner">🍽️ Dinner</option>
                    <option value="party">🎉 Party</option>
                  </select>
                  <ChevronDown className="absolute right-2 top-2.5 h-4 w-4 text-gray-400 pointer-events-none" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Date</label>
                <input
                  type="date"
                  value={createDate}
                  onChange={e => setCreateDate(e.target.value)}
                  className="rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs text-gray-500 mb-1">Title (optional)</label>
                <input
                  type="text"
                  value={createTitle}
                  onChange={e => setCreateTitle(e.target.value)}
                  placeholder="e.g., Happy Hour - Team Outing"
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex-1">
                <label className="block text-xs text-gray-500 mb-1">Venue (optional)</label>
                <div className="relative">
                  <select
                    value={createVenueId}
                    onChange={e => setCreateVenueId(e.target.value)}
                    className="w-full appearance-none rounded border border-gray-300 bg-white px-3 py-2 pr-8 text-sm focus:border-blue-500 focus:outline-none"
                  >
                    <option value="">No venue</option>
                    {data.venues.map(v => (
                      <option key={v.id} value={v.id}>
                        {v.name} {v.city ? `(${v.city})` : ''} — {v.venueType}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-2 top-2.5 h-4 w-4 text-gray-400 pointer-events-none" />
                </div>
              </div>
            </div>
            {/* Add Contacts */}
            <div>
              <label className="block text-xs text-gray-500 mb-1">People (optional)</label>
              {createContactIds.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-2">
                  {createContactIds.map(cid => {
                    const c = data.contacts.find(x => x.id === cid)
                    return c ? (
                      <span key={cid} className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700">
                        {c.name}
                        <button onClick={() => setCreateContactIds(prev => prev.filter(x => x !== cid))} className="text-blue-400 hover:text-blue-600">
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ) : null
                  })}
                </div>
              )}
              <div className="flex items-center gap-2">
                <Search className="h-3.5 w-3.5 text-gray-400" />
                <input
                  type="text"
                  value={createSearchQuery}
                  onChange={e => handleSearchContacts(e.target.value, true)}
                  placeholder="Search contacts to add..."
                  className="flex-1 text-sm border border-gray-200 rounded px-2 py-1.5 outline-none focus:border-blue-400 placeholder-gray-400"
                />
              </div>
              {createSearchResults.length > 0 && (
                <div className="mt-1 space-y-0.5 max-h-32 overflow-y-auto border border-gray-100 rounded">
                  {createSearchResults
                    .filter(r => !createContactIds.includes(r.id))
                    .map(r => (
                      <button
                        key={r.id}
                        onClick={() => { setCreateContactIds(prev => [...prev, r.id]); setCreateSearchQuery(''); setCreateSearchResults([]) }}
                        className="flex items-center justify-between w-full px-2 py-1.5 text-left hover:bg-blue-50 text-sm"
                      >
                        <span>{r.name}</span>
                        <Plus className="h-3 w-3 text-blue-500" />
                      </button>
                    ))}
                </div>
              )}
            </div>
            <button
              onClick={handleCreateManual}
              disabled={creating}
              className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
            >
              {creating ? 'Creating...' : 'Create Plan'}
            </button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {[
          { key: 'active' as const, label: 'Active', count: activePlans.length },
          { key: 'past' as const, label: 'Past', count: pastPlans.length },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label} {t.count > 0 && <span className="ml-1 text-xs">({t.count})</span>}
          </button>
        ))}
      </div>

      {/* Plan Cards */}
      {displayPlans.length === 0 ? (
        <p className="text-sm text-gray-500 py-8 text-center">
          {tab === 'active' ? 'No active plans. Generate or create one above!' : 'No past plans yet.'}
        </p>
      ) : (
        <div className="space-y-4">
          {displayPlans.map(plan => {
            const meta = PLAN_TYPE_META[plan.planType] || PLAN_TYPE_META.happy_hour
            const hasDrafts = plan.suggestedContacts.some(c => c.draftText)
            const allSent = plan.suggestedContacts.length > 0 && plan.suggestedContacts.every(c => c.sentAt)
            const unsent = plan.suggestedContacts.filter(c => c.draftText && !c.sentAt)
            const editable = isEditable(plan.status)

            return (
              <div key={plan.id} className={`rounded-lg border p-5 ${meta.color}`}>
                {/* Header */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{meta.icon}</span>
                    <div>
                      {/* Title (editable) */}
                      {editingTitleId === plan.id ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="text"
                            value={editTitleText}
                            onChange={e => setEditTitleText(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') handleSaveTitle(plan.id, editTitleText); if (e.key === 'Escape') setEditingTitleId(null) }}
                            autoFocus
                            className="rounded border border-gray-300 px-2 py-0.5 text-sm font-semibold text-gray-900 focus:border-blue-500 focus:outline-none"
                            placeholder="Plan title..."
                          />
                          <button onClick={() => handleSaveTitle(plan.id, editTitleText)} className="text-green-600 hover:text-green-700">
                            <Check className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => setEditingTitleId(null)} className="text-gray-400 hover:text-gray-600">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <h3 className="font-semibold text-gray-900">
                            {plan.title || meta.label}
                          </h3>
                          {editable && (
                            <button
                              onClick={() => { setEditingTitleId(plan.id); setEditTitleText(plan.title || '') }}
                              className="rounded p-0.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50"
                              title="Edit title"
                            >
                              <Pencil className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      )}
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <Calendar className="h-3 w-3" />
                        {formatDate(plan.targetDate)}
                        {plan.time && (
                          <>
                            <Clock className="h-3 w-3 ml-1" />
                            {plan.time}
                          </>
                        )}
                        <span className="text-gray-300">|</span>
                        <span>{plan.suggestedContacts.length} people</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[plan.status] || STATUS_COLORS.pending}`}>
                      {plan.status.replace('_', ' ')}
                    </span>
                    {['pending', 'modified'].includes(plan.status) && (
                      <div className="flex gap-1">
                        <button
                          onClick={() => handleAction(plan.id, 'approve')}
                          className="rounded bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700"
                        >
                          <Check className="h-3 w-3 inline mr-1" />Approve
                        </button>
                        <button
                          onClick={() => {
                            const newDate = new Date(plan.targetDate)
                            newDate.setDate(newDate.getDate() + 7)
                            handleAction(plan.id, 'postpone', { newDate: newDate.toISOString().split('T')[0] })
                          }}
                          className="rounded bg-orange-500 px-3 py-1 text-xs font-medium text-white hover:bg-orange-600"
                        >
                          <Clock className="h-3 w-3 inline mr-1" />+1 Week
                        </button>
                        <button
                          onClick={() => handleAction(plan.id, 'skip')}
                          className="rounded bg-gray-400 px-3 py-1 text-xs font-medium text-white hover:bg-gray-500"
                        >
                          <X className="h-3 w-3 inline mr-1" />Skip
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Reasoning */}
                {plan.groupReasoning && (
                  <p className="text-xs text-gray-600 mb-3 italic">{plan.groupReasoning}</p>
                )}

                {/* Venue */}
                <div className="mb-3">
                  {editingVenueId === plan.id ? (
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-gray-400" />
                      <select
                        value={plan.suggestedVenueId || ''}
                        onChange={e => handleSwapVenue(plan.id, e.target.value)}
                        autoFocus
                        className="rounded border border-gray-300 bg-white px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
                      >
                        <option value="">No venue</option>
                        {data.venues.map(v => (
                          <option key={v.id} value={v.id}>
                            {v.name} {v.city ? `(${v.city})` : ''} — {v.venueType}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => setEditingVenueId(null)}
                        className="text-gray-400 hover:text-gray-600"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-gray-500">📍</span>
                      <span className="font-medium text-gray-900">{plan.venue?.name || 'No venue'}</span>
                      {plan.venue?.city && <span className="text-xs text-gray-400">{plan.venue.city}</span>}
                      {editable && (
                        <button
                          onClick={() => setEditingVenueId(plan.id)}
                          className="rounded p-0.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50"
                          title="Change venue"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Notes */}
                {(plan.notes || editable) && (
                  <div className="mb-3">
                    {editingNotesId === plan.id ? (
                      <div>
                        <textarea
                          value={editNotesText}
                          onChange={e => setEditNotesText(e.target.value)}
                          rows={2}
                          autoFocus
                          placeholder="Add notes..."
                          className="w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm text-gray-700 focus:border-blue-400 focus:outline-none resize-y"
                        />
                        <div className="flex gap-1 mt-1">
                          <button onClick={() => handleSaveNotes(plan.id, editNotesText)} className="rounded bg-blue-600 px-2 py-0.5 text-xs text-white hover:bg-blue-700">Save</button>
                          <button onClick={() => setEditingNotesId(null)} className="rounded border border-gray-200 px-2 py-0.5 text-xs text-gray-500 hover:bg-gray-50">Cancel</button>
                        </div>
                      </div>
                    ) : plan.notes ? (
                      <div className="flex items-start gap-2">
                        <FileText className="h-3.5 w-3.5 text-gray-400 mt-0.5 flex-shrink-0" />
                        <p className="text-xs text-gray-600">{plan.notes}</p>
                        {editable && (
                          <button
                            onClick={() => { setEditingNotesId(plan.id); setEditNotesText(plan.notes || '') }}
                            className="rounded p-0.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 flex-shrink-0"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    ) : editable ? (
                      <button
                        onClick={() => { setEditingNotesId(plan.id); setEditNotesText('') }}
                        className="flex items-center gap-1 text-xs text-gray-400 hover:text-blue-600"
                      >
                        <FileText className="h-3 w-3" /> Add notes
                      </button>
                    ) : null}
                  </div>
                )}

                {/* Contacts */}
                <div className="space-y-2">
                  {plan.suggestedContacts.map((c, idx) => {
                    const draftKey = `${plan.id}:${c.contactId}`
                    const isEditingDraft = editingDraftKey === draftKey
                    const isWritingDraft = writingDraftKey === draftKey

                    return (
                      <div key={idx} className="rounded bg-white/70 p-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Link href={`/contacts/${c.contactId}`} className="font-medium text-gray-900 hover:text-blue-600">
                              {c.name}
                            </Link>
                            <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${RING_COLORS[c.ring] || RING_COLORS.new}`}>
                              {c.ring}
                            </span>
                            {c.sentAt && !c.responseStatus && (
                              <span className="text-xs text-gray-400">❓ Awaiting</span>
                            )}
                            {c.responseStatus && (
                              <span className="text-xs">{RESPONSE_ICONS[c.responseStatus] || '❓'} {c.responseStatus}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            {c.sentAt && <span className="text-[10px] text-green-600">✅ Sent</span>}
                            {c.score > 0 && <span className="text-xs text-gray-400">Score: {c.score.toFixed(2)}</span>}
                            {editable && !c.sentAt && (
                              <button
                                onClick={() => handleAction(plan.id, 'remove_contact', { contactId: c.contactId })}
                                className="rounded p-0.5 text-gray-400 hover:text-red-600 hover:bg-red-50"
                                title={`Remove ${c.name}`}
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                        {c.reasoning && c.reasoning !== 'manually added' && c.reasoning !== 'migrated from event' && (
                          <p className="text-[11px] text-gray-500 mt-0.5">{c.reasoning}</p>
                        )}
                        {c.hooks && c.hooks.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {c.hooks.map((h, i) => (
                              <span key={i} className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] text-blue-600">
                                {h}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Draft Text (existing) */}
                        {c.draftText && !isEditingDraft && !isWritingDraft && (
                          <div className="mt-2 rounded-lg bg-green-50 border border-green-100 p-2.5">
                            <div className="flex items-start justify-between">
                              <p className="text-sm text-gray-800 whitespace-pre-wrap">{c.draftText}</p>
                              <div className="flex gap-1 ml-2 flex-shrink-0">
                                {!c.sentAt && (
                                  <button
                                    onClick={() => { setEditingDraftKey(draftKey); setEditDraftText(c.draftText!) }}
                                    className="rounded p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50"
                                    title="Edit"
                                  >
                                    <Pencil className="h-3 w-3" />
                                  </button>
                                )}
                                <button
                                  onClick={() => copyToClipboard(c.draftText!)}
                                  className="rounded p-1 text-gray-400 hover:text-gray-600 hover:bg-green-100"
                                  title="Copy"
                                >
                                  <Copy className="h-3 w-3" />
                                </button>
                                {!c.sentAt && (
                                  <button
                                    onClick={() => handleSendOne(plan.id, c.contactId, c.name)}
                                    disabled={sendingContactId === c.contactId}
                                    className="rounded p-1 text-green-500 hover:text-green-700 hover:bg-green-100 disabled:opacity-50"
                                    title={`Send to ${c.name}`}
                                  >
                                    <Send className={`h-3 w-3 ${sendingContactId === c.contactId ? 'animate-pulse' : ''}`} />
                                  </button>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              {c.voiceSource && (
                                <span className="text-[10px] text-green-600">
                                  {c.voiceSource === 'per_contact' ? '🎯 personal voice' : c.voiceSource === 'fallback' ? '📝 fallback' : `📋 ${c.voiceSource}`}
                                </span>
                              )}
                              {c.sentAt && (
                                <span className="text-[10px] text-green-600">
                                  📤 Sent {new Date(c.sentAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                                </span>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Editing Draft */}
                        {isEditingDraft && (
                          <div className="mt-2 rounded-lg bg-green-50 border border-green-100 p-2.5">
                            <textarea
                              value={editDraftText}
                              onChange={e => setEditDraftText(e.target.value)}
                              rows={4}
                              autoFocus
                              className="w-full rounded border border-green-200 bg-white p-2 text-sm text-gray-800 focus:border-blue-400 focus:outline-none resize-y"
                            />
                            <div className="flex gap-1.5 mt-1.5">
                              <button
                                onClick={() => handleSaveDraft(plan.id, c.contactId, editDraftText)}
                                className="rounded bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700"
                              >
                                Save
                              </button>
                              <button
                                onClick={() => { setEditingDraftKey(null); setEditDraftText('') }}
                                className="rounded border border-gray-200 bg-white px-2.5 py-1 text-xs text-gray-500 hover:bg-gray-50"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Writing Draft from scratch */}
                        {isWritingDraft && (
                          <div className="mt-2 rounded-lg bg-blue-50 border border-blue-100 p-2.5">
                            <textarea
                              value={writeDraftText}
                              onChange={e => setWriteDraftText(e.target.value)}
                              rows={3}
                              autoFocus
                              placeholder={`Write a text to ${c.name}...`}
                              className="w-full rounded border border-blue-200 bg-white p-2 text-sm text-gray-800 focus:border-blue-400 focus:outline-none resize-y"
                            />
                            <div className="flex gap-1.5 mt-1.5">
                              <button
                                onClick={() => handleSaveDraft(plan.id, c.contactId, writeDraftText)}
                                className="rounded bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700"
                              >
                                Save Draft
                              </button>
                              <button
                                onClick={() => { setWritingDraftKey(null); setWriteDraftText('') }}
                                className="rounded border border-gray-200 bg-white px-2.5 py-1 text-xs text-gray-500 hover:bg-gray-50"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Write button (when no draft and not currently writing/editing) */}
                        {!c.draftText && !isWritingDraft && !isEditingDraft && editable && !c.sentAt && (
                          <button
                            onClick={() => { setWritingDraftKey(draftKey); setWriteDraftText('') }}
                            className="mt-1.5 flex items-center gap-1 text-xs text-gray-400 hover:text-blue-600"
                          >
                            <MessageSquare className="h-3 w-3" /> Write text
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>

                {/* Add Contact */}
                {editable && (
                  <div className="mt-3">
                    {addingToPlanId === plan.id ? (
                      <div className="rounded bg-white/70 p-3 border border-dashed border-gray-300">
                        <div className="flex items-center gap-2 mb-2">
                          <Search className="h-3.5 w-3.5 text-gray-400" />
                          <input
                            type="text"
                            value={searchQuery}
                            onChange={e => handleSearchContacts(e.target.value)}
                            placeholder="Search contacts to add..."
                            autoFocus
                            className="flex-1 text-sm border-none outline-none bg-transparent placeholder-gray-400"
                          />
                          <button
                            onClick={() => { setAddingToPlanId(null); setSearchQuery(''); setSearchResults([]) }}
                            className="text-gray-400 hover:text-gray-600"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        {searching && <p className="text-xs text-gray-400">Searching...</p>}
                        {searchResults.length > 0 && (
                          <div className="space-y-1 max-h-40 overflow-y-auto">
                            {searchResults
                              .filter(r => !plan.suggestedContacts.some(c => c.contactId === r.id))
                              .map(r => (
                                <button
                                  key={r.id}
                                  onClick={() => handleAddContact(plan.id, r.id)}
                                  className="flex items-center justify-between w-full rounded px-2 py-1.5 text-left hover:bg-blue-50 transition-colors"
                                >
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-medium text-gray-900">{r.name}</span>
                                    {r.personalRing && (
                                      <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${RING_COLORS[r.personalRing] || RING_COLORS.new}`}>
                                        {r.personalRing}
                                      </span>
                                    )}
                                    {r.city && <span className="text-[10px] text-gray-400">{r.city}</span>}
                                  </div>
                                  <Plus className="h-3.5 w-3.5 text-blue-500" />
                                </button>
                              ))}
                          </div>
                        )}
                        {searchQuery.length >= 2 && !searching && searchResults.filter(r => !plan.suggestedContacts.some(c => c.contactId === r.id)).length === 0 && (
                          <p className="text-xs text-gray-400">No contacts found</p>
                        )}
                      </div>
                    ) : (
                      <button
                        onClick={() => setAddingToPlanId(plan.id)}
                        className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-blue-600 transition-colors"
                      >
                        <UserPlus className="h-3.5 w-3.5" />
                        Add person
                      </button>
                    )}
                  </div>
                )}

                {/* Draft/Send Actions */}
                {plan.status === 'approved' && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      onClick={() => handleGenerateDrafts(plan.id)}
                      disabled={draftingPlanId === plan.id}
                      className="flex items-center gap-1 rounded bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                    >
                      <RefreshCw className={`h-3 w-3 ${draftingPlanId === plan.id ? 'animate-spin' : ''}`} />
                      {draftingPlanId === plan.id ? 'Generating...' : hasDrafts ? 'Regenerate All' : 'AI Generate Texts'}
                    </button>
                    {hasDrafts && unsent.length > 0 && (
                      <button
                        onClick={() => handleSendAll(plan.id)}
                        disabled={sendingPlanId === plan.id}
                        className="flex items-center gap-1 rounded bg-green-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
                      >
                        <Send className={`h-3 w-3 ${sendingPlanId === plan.id ? 'animate-pulse' : ''}`} />
                        {sendingPlanId === plan.id ? 'Sending...' : `Send All (${unsent.length}) via iMessage`}
                      </button>
                    )}
                    {(allSent || plan.suggestedContacts.length === 0) && (
                      <button
                        onClick={() => handleAction(plan.id, 'complete')}
                        className="flex items-center gap-1 rounded bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
                      >
                        <Check className="h-3 w-3" />
                        Complete Plan
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function getDefaultDate(): string {
  const d = new Date()
  d.setDate(d.getDate() + 3)
  return d.toISOString().split('T')[0]
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}
