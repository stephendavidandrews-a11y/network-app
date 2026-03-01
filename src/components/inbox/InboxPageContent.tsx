'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  Inbox,
  Mail,
  MessageSquare,
  Mic,
  FileText,
  Radio,
  Check,
  X,
  Undo2,
  ChevronDown,
  ChevronUp,
  Calendar,
  Users,
  Handshake,
  BookOpen,
  Target,
  Heart,
  Briefcase,
  Clock,
  CheckCircle,
  CalendarPlus,
  Loader2,
  Plus,
  Send,
  MapPin,
  Search,
  UserPlus,
  Link2,
} from 'lucide-react'
import { TIER_COLORS } from '@/lib/constants'
import type { IngestionExtraction } from '@/types'

interface InboxItem {
  id: string
  source: string
  itemType: string
  contactId: string | null
  contactHint: string | null
  contactName: string | null
  contactOrg: string | null
  contactTier: number | null
  status: string
  clusterId: string | null
  autoHandled: boolean
  confidence: number | null
  createdAt: string
  reviewedAt: string | null
  extraction: IngestionExtraction | null
  manifest: Record<string, unknown> | null
}

interface InboxStats {
  pending: number
  confirmed: number
  dismissed: number
  edited: number
  auto_handled: number
}

const SOURCE_ICONS: Record<string, typeof Mail> = {
  email: Mail,
  imessage_auto: MessageSquare,
  ios_shortcut: FileText,
  voice: Mic,
  signal_forward: Radio,
  manual: FileText,
}

const SOURCE_LABELS: Record<string, string> = {
  email: 'Email',
  imessage_auto: 'iMessage',
  ios_shortcut: 'iOS Note',
  voice: 'Voice',
  signal_forward: 'Signal',
  manual: 'Manual',
}

const TYPE_COLORS: Record<string, string> = {
  interaction: 'text-blue-700 bg-blue-50 border-blue-200',
  intelligence_signal: 'text-purple-700 bg-purple-50 border-purple-200',
  scheduling: 'text-green-700 bg-green-50 border-green-200',
  irrelevant: 'text-gray-500 bg-gray-50 border-gray-200',
}

const TYPE_LABELS: Record<string, string> = {
  interaction: 'Interaction',
  intelligence_signal: 'Intel Signal',
  scheduling: 'Scheduling',
  irrelevant: 'Irrelevant',
}

const SENTIMENT_COLORS: Record<string, string> = {
  warm: 'text-orange-600',
  neutral: 'text-gray-500',
  transactional: 'text-blue-600',
  tense: 'text-red-600',
  enthusiastic: 'text-green-600',
}

export function InboxPageContent() {
  const [items, setItems] = useState<InboxItem[]>([])
  const [stats, setStats] = useState<InboxStats>({ pending: 0, confirmed: 0, dismissed: 0, edited: 0, auto_handled: 0 })
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'pending' | 'confirmed' | 'dismissed' | 'all'>('pending')
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set())
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showIngestForm, setShowIngestForm] = useState(false)
  const [ingestContent, setIngestContent] = useState('')
  const [ingestSource, setIngestSource] = useState<string>('manual')
  const [ingestContactHint, setIngestContactHint] = useState('')
  const [ingestLoading, setIngestLoading] = useState(false)

  const fetchItems = useCallback(async () => {
    try {
      const res = await fetch(`/api/inbox?status=${filter}`)
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setItems(data.items || [])
      setStats(data.stats || { pending: 0, confirmed: 0, dismissed: 0, edited: 0, auto_handled: 0 })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load inbox')
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => {
    setLoading(true)
    fetchItems()
  }, [fetchItems])

  const toggleExpand = (id: string) => {
    setExpandedItems(prev => {
      const next = new Set(Array.from(prev))
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const handleConfirm = async (id: string) => {
    setActionLoading(id)
    try {
      const res = await fetch(`/api/inbox/${id}/confirm`, { method: 'POST' })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      await fetchItems()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to confirm')
    } finally {
      setActionLoading(null)
    }
  }

  const handleDismiss = async (id: string, reason?: string) => {
    setActionLoading(id)
    try {
      const res = await fetch(`/api/inbox/${id}/dismiss`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      await fetchItems()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to dismiss')
    } finally {
      setActionLoading(null)
    }
  }

  const handleUndo = async (id: string) => {
    setActionLoading(id)
    try {
      const res = await fetch(`/api/inbox/${id}/undo`, { method: 'POST' })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      await fetchItems()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to undo')
    } finally {
      setActionLoading(null)
    }
  }

  const handleAssign = async (itemId: string, contactId: string) => {
    setActionLoading(itemId)
    try {
      const res = await fetch(`/api/inbox/${itemId}/assign`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactId }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      await fetchItems()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to assign contact')
    } finally {
      setActionLoading(null)
    }
  }

  const handleBatchConfirm = async () => {
    const pendingItems = items.filter(i => i.status === 'pending' && i.extraction?.itemType !== 'irrelevant')
    for (const item of pendingItems) {
      await handleConfirm(item.id)
    }
  }

  const handleManualIngest = async () => {
    if (!ingestContent.trim()) return
    setIngestLoading(true)
    try {
      const res = await fetch('/api/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: ingestSource,
          content: ingestContent,
          contactHint: ingestContactHint || undefined,
        }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      if (data.duplicate) {
        setError('Duplicate content — already in queue')
      } else {
        setIngestContent('')
        setIngestContactHint('')
        setShowIngestForm(false)
        setFilter('pending')
        await fetchItems()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to ingest')
    } finally {
      setIngestLoading(false)
    }
  }

  function formatTime(dateStr: string): string {
    try {
      const d = new Date(dateStr)
      return d.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    } catch {
      return dateStr
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Inbox className="w-7 h-7 text-blue-600" />
          <h1 className="text-2xl font-bold text-gray-900">Inbox</h1>
          {stats.pending > 0 && (
            <span className="px-2.5 py-0.5 rounded-full text-sm font-medium bg-blue-100 text-blue-700 border border-blue-200">
              {stats.pending} pending
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowIngestForm(!showIngestForm)}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors flex items-center gap-1.5 ${
              showIngestForm
                ? 'text-white bg-blue-600 hover:bg-blue-700'
                : 'text-gray-700 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            <Plus className="w-4 h-4" />
            Add Note
          </button>
          {filter === 'pending' && items.length > 1 && (
            <button
              onClick={handleBatchConfirm}
              className="px-4 py-1.5 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-md transition-colors"
            >
              Confirm All ({items.filter(i => i.extraction?.itemType !== 'irrelevant').length})
            </button>
          )}
        </div>
      </div>

      {/* Manual Ingest Form */}
      {showIngestForm && (
        <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-4 space-y-3">
          <div className="flex items-center gap-3">
            <select
              value={ingestSource}
              onChange={e => setIngestSource(e.target.value)}
              className="px-3 py-2 text-sm bg-white border border-gray-200 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="manual">Manual Note</option>
              <option value="email">Email (paste)</option>
              <option value="voice">Voice Transcript</option>
              <option value="imessage_auto">iMessage</option>
              <option value="signal_forward">Signal</option>
            </select>
            <input
              type="text"
              value={ingestContactHint}
              onChange={e => setIngestContactHint(e.target.value)}
              placeholder="Contact name or email (optional)"
              className="flex-1 px-3 py-2 text-sm bg-white border border-gray-200 rounded-md text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <textarea
            value={ingestContent}
            onChange={e => setIngestContent(e.target.value)}
            placeholder="Paste email, meeting notes, text exchange, voice transcript..."
            rows={6}
            className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-md text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-y"
          />
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-500">
              Content will be analyzed by Claude and queued for review
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowIngestForm(false)}
                className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={handleManualIngest}
                disabled={ingestLoading || !ingestContent.trim()}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {ingestLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {ingestLoading ? 'Processing...' : 'Submit'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stats Bar */}
      <div className="grid grid-cols-5 gap-3">
        {[
          { label: 'Pending', value: stats.pending, color: 'text-blue-600', key: 'pending' as const },
          { label: 'Confirmed', value: stats.confirmed + stats.edited, color: 'text-green-600', key: 'confirmed' as const },
          { label: 'Dismissed', value: stats.dismissed, color: 'text-gray-500', key: 'dismissed' as const },
          { label: 'Auto-handled', value: stats.auto_handled, color: 'text-purple-600', key: 'all' as const },
          { label: 'Total', value: stats.pending + stats.confirmed + stats.dismissed + stats.edited + stats.auto_handled, color: 'text-gray-900', key: 'all' as const },
        ].map(stat => (
          <button
            key={stat.label}
            onClick={() => setFilter(stat.key)}
            className={`p-3 rounded-lg border transition-colors ${
              filter === stat.key
                ? 'bg-white border-blue-300 shadow-sm ring-1 ring-blue-100'
                : 'bg-white border-gray-200 hover:border-gray-300'
            }`}
          >
            <div className={`text-2xl font-bold ${stat.color}`}>{stat.value}</div>
            <div className="text-xs text-gray-500">{stat.label}</div>
          </button>
        ))}
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline">dismiss</button>
        </div>
      )}

      {/* Items List */}
      {items.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Inbox className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p className="text-lg text-gray-500">No {filter} items</p>
          <p className="text-sm mt-1 text-gray-400">
            {filter === 'pending'
              ? 'Forward emails to notes@ or use Add Note above'
              : `No ${filter} items yet`}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map(item => (
            <InboxCard
              key={item.id}
              item={item}
              expanded={expandedItems.has(item.id)}
              onToggle={() => toggleExpand(item.id)}
              onConfirm={() => handleConfirm(item.id)}
              onDismiss={(reason) => handleDismiss(item.id, reason)}
              onUndo={() => handleUndo(item.id)}
              onAssign={handleAssign}
              isLoading={actionLoading === item.id}
              formatTime={formatTime}
            />
          ))}
        </div>
      )}
    </div>
  )
}

interface SimpleContact {
  id: string
  name: string
  organization: string | null
  tier: number
}

interface InboxCardProps {
  item: InboxItem
  expanded: boolean
  onToggle: () => void
  onConfirm: () => void
  onDismiss: (reason?: string) => void
  onUndo: () => void
  onAssign: (itemId: string, contactId: string) => Promise<void>
  isLoading: boolean
  formatTime: (d: string) => string
}

function InboxCard({ item, expanded, onToggle, onConfirm, onDismiss, onUndo, onAssign, isLoading, formatTime }: InboxCardProps) {
  const [dismissReason, setDismissReason] = useState('')
  const [showDismissForm, setShowDismissForm] = useState(false)
  const [editedCalEvents, setEditedCalEvents] = useState<Record<number, Partial<{ title: string; date: string; startTime: string; endTime: string; location: string }>>>({})
  const [addedCalEvents, setAddedCalEvents] = useState<Set<number>>(new Set())
  const [calEventLoading, setCalEventLoading] = useState<number | null>(null)
  const [calEventError, setCalEventError] = useState<string | null>(null)
  // Contact assignment state
  const [showContactPicker, setShowContactPicker] = useState(false)
  const [contactSearch, setContactSearch] = useState('')
  const [allContacts, setAllContacts] = useState<SimpleContact[]>([])
  const [contactsLoaded, setContactsLoaded] = useState(false)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [newContactName, setNewContactName] = useState(item.contactHint || '')
  const [newContactOrg, setNewContactOrg] = useState('')
  const [newContactEmail, setNewContactEmail] = useState('')
  const [assignLoading, setAssignLoading] = useState(false)
  const ext = item.extraction

  // Load contacts when picker opens
  const loadContacts = async () => {
    if (contactsLoaded) return
    try {
      const res = await fetch('/api/contacts')
      const data = await res.json()
      if (Array.isArray(data)) {
        setAllContacts(data.map((c: Record<string, unknown>) => ({
          id: c.id as string,
          name: c.name as string,
          organization: c.organization as string | null,
          tier: c.tier as number,
        })))
      }
      setContactsLoaded(true)
    } catch {
      // Silent fail — user can retry
    }
  }

  const handleAssignExisting = async (contactId: string) => {
    setAssignLoading(true)
    try {
      await onAssign(item.id, contactId)
      setShowContactPicker(false)
    } finally {
      setAssignLoading(false)
    }
  }

  const handleCreateAndAssign = async () => {
    if (!newContactName.trim()) return
    setAssignLoading(true)
    try {
      // Create contact
      const createRes = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newContactName.trim(),
          organization: newContactOrg.trim() || null,
          email: newContactEmail.trim() || null,
          tier: 2,
        }),
      })
      const contact = await createRes.json()
      if (contact.error) throw new Error(contact.error)

      // Assign to item
      await onAssign(item.id, contact.id)
      setShowContactPicker(false)
      setShowCreateForm(false)
    } catch {
      // Error handled by parent
    } finally {
      setAssignLoading(false)
    }
  }

  const filteredContacts = contactSearch.trim()
    ? allContacts.filter(c =>
        c.name.toLowerCase().includes(contactSearch.toLowerCase()) ||
        (c.organization && c.organization.toLowerCase().includes(contactSearch.toLowerCase()))
      )
    : allContacts.slice(0, 10)

  const updateCalEvent = (idx: number, field: string, value: string) => {
    setEditedCalEvents(prev => ({
      ...prev,
      [idx]: { ...(prev[idx] || {}), [field]: value },
    }))
  }

  const handleAddToCalendar = async (idx: number) => {
    if (!ext) return
    const event = ext.calendarEvents[idx]
    if (!event) return

    const edits = editedCalEvents[idx] || {}
    const title = edits.title || event.title
    const date = edits.date || event.date
    const startTime = edits.startTime || event.startTime
    const endTime = edits.endTime || event.endTime
    const location = edits.location || event.location

    if (!date) {
      setCalEventError('Date is required')
      return
    }

    // Build ISO datetimes
    const startISO = startTime ? `${date}T${startTime}:00` : `${date}T09:00:00`
    const endISO = endTime ? `${date}T${endTime}:00` : (startTime ? `${date}T${(parseInt(startTime.split(':')[0]) + 1).toString().padStart(2, '0')}:${startTime.split(':')[1]}:00` : `${date}T10:00:00`)

    setCalEventLoading(idx)
    setCalEventError(null)

    try {
      const res = await fetch('/api/calendar/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          summary: title,
          start: startISO,
          end: endISO,
          location: location || undefined,
          description: item.contactName ? `With ${item.contactName}${item.contactOrg ? ` (${item.contactOrg})` : ''}` : undefined,
        }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)

      setAddedCalEvents(prev => {
        const next = new Set(Array.from(prev))
        next.add(idx)
        return next
      })
    } catch (err) {
      setCalEventError(err instanceof Error ? err.message : 'Failed to create event')
    } finally {
      setCalEventLoading(null)
    }
  }

  const SourceIcon = SOURCE_ICONS[item.source] || FileText
  const isPending = item.status === 'pending'
  const isConfirmed = item.status === 'confirmed' || item.status === 'edited'

  return (
    <div className={`rounded-lg border transition-colors bg-white ${
      isPending
        ? 'border-blue-200 shadow-sm'
        : isConfirmed
          ? 'border-green-200'
          : 'border-gray-200 opacity-75'
    }`}>
      {/* Header Row */}
      <div className="px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-gray-50 rounded-t-lg" onClick={onToggle}>
        <SourceIcon className={`w-4 h-4 flex-shrink-0 ${item.source === 'voice' ? 'text-violet-500' : 'text-gray-400'}`} />

        {/* Type Badge */}
        <span className={`px-2 py-0.5 rounded text-xs font-medium border ${TYPE_COLORS[item.itemType] || TYPE_COLORS.interaction}`}>
          {TYPE_LABELS[item.itemType] || item.itemType}
        </span>

        {/* Contact Name */}
        <div className="flex-1 min-w-0">
          {item.contactName ? (
            <span className="text-sm font-medium text-gray-900">
              {item.contactId ? (
                <Link href={`/contacts/${item.contactId}`} className="hover:text-blue-600" onClick={e => e.stopPropagation()}>
                  {item.contactName}
                </Link>
              ) : (
                item.contactName
              )}
              {item.contactOrg && <span className="text-gray-500 ml-1">({item.contactOrg})</span>}
              {item.contactTier && (
                <span className={`ml-2 px-1.5 py-0.5 rounded text-xs border ${TIER_COLORS[item.contactTier]}`}>
                  T{item.contactTier}
                </span>
              )}
            </span>
          ) : (
            <span className="text-sm text-gray-400 italic flex items-center gap-1.5">
              {item.contactHint || 'Unknown contact'}
              {isPending && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setShowContactPicker(true)
                    loadContacts()
                  }}
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium text-blue-600 bg-blue-50 border border-blue-200 hover:bg-blue-100 transition-colors"
                >
                  <Link2 className="w-3 h-3" />
                  Link
                </button>
              )}
            </span>
          )}
        </div>

        {/* Summary Preview (collapsed) */}
        {!expanded && ext?.summary && (
          <span className="text-sm text-gray-400 truncate max-w-[300px] hidden lg:inline">
            {ext.summary.slice(0, 100)}...
          </span>
        )}

        {/* Source Label + Time */}
        <span className="text-xs text-gray-400 flex-shrink-0">
          {SOURCE_LABELS[item.source]} · {formatTime(item.createdAt)}
        </span>

        {/* Status Indicator */}
        {isConfirmed && <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />}
        {item.status === 'dismissed' && <X className="w-4 h-4 text-gray-400 flex-shrink-0" />}

        {/* Expand Arrow */}
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
        )}
      </div>

      {/* Contact Assignment Panel */}
      {showContactPicker && (
        <div className="px-4 py-3 border-t border-blue-100 bg-blue-50/50" onClick={e => e.stopPropagation()}>
          {!showCreateForm ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Search className="w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={contactSearch}
                  onChange={e => setContactSearch(e.target.value)}
                  placeholder="Search contacts..."
                  className="flex-1 px-3 py-1.5 text-sm bg-white border border-gray-200 rounded-md text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                />
                <button
                  onClick={() => { setShowCreateForm(true); setNewContactName(item.contactHint || '') }}
                  className="px-3 py-1.5 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-md hover:bg-green-100 transition-colors flex items-center gap-1"
                >
                  <UserPlus className="w-3 h-3" />
                  New
                </button>
                <button
                  onClick={() => setShowContactPicker(false)}
                  className="px-2 py-1.5 text-xs text-gray-400 hover:text-gray-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              {filteredContacts.length > 0 ? (
                <div className="max-h-48 overflow-y-auto rounded-md border border-gray-200 bg-white divide-y divide-gray-100">
                  {filteredContacts.map(c => (
                    <button
                      key={c.id}
                      onClick={() => handleAssignExisting(c.id)}
                      disabled={assignLoading}
                      className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 transition-colors flex items-center justify-between disabled:opacity-50"
                    >
                      <span>
                        <span className="font-medium text-gray-900">{c.name}</span>
                        {c.organization && <span className="text-gray-400 ml-1">({c.organization})</span>}
                      </span>
                      <span className={`px-1.5 py-0.5 rounded text-xs border ${TIER_COLORS[c.tier]}`}>
                        T{c.tier}
                      </span>
                    </button>
                  ))}
                </div>
              ) : contactsLoaded ? (
                <p className="text-xs text-gray-400 text-center py-2">
                  No contacts found.{' '}
                  <button onClick={() => { setShowCreateForm(true); setNewContactName(contactSearch || item.contactHint || '') }} className="text-blue-500 hover:underline">
                    Create new
                  </button>
                </p>
              ) : (
                <p className="text-xs text-gray-400 text-center py-2">Loading contacts...</p>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <UserPlus className="w-4 h-4 text-green-600" />
                Create New Contact
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input
                  type="text"
                  value={newContactName}
                  onChange={e => setNewContactName(e.target.value)}
                  placeholder="Name *"
                  className="px-3 py-1.5 text-sm bg-white border border-gray-200 rounded-md text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                />
                <input
                  type="text"
                  value={newContactOrg}
                  onChange={e => setNewContactOrg(e.target.value)}
                  placeholder="Organization"
                  className="px-3 py-1.5 text-sm bg-white border border-gray-200 rounded-md text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <input
                  type="email"
                  value={newContactEmail}
                  onChange={e => setNewContactEmail(e.target.value)}
                  placeholder="Email"
                  className="px-3 py-1.5 text-sm bg-white border border-gray-200 rounded-md text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCreateAndAssign}
                  disabled={assignLoading || !newContactName.trim()}
                  className="px-4 py-1.5 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-md transition-colors disabled:opacity-50 flex items-center gap-1"
                >
                  {assignLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserPlus className="w-3 h-3" />}
                  Create & Link
                </button>
                <button
                  onClick={() => setShowCreateForm(false)}
                  className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700"
                >
                  Back to search
                </button>
                <button
                  onClick={() => { setShowContactPicker(false); setShowCreateForm(false) }}
                  className="px-2 py-1.5 text-xs text-gray-400 hover:text-gray-600 ml-auto"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Expanded Content */}
      {expanded && ext && (
        <div className="px-4 pb-4 border-t border-gray-100 space-y-4">
          {/* Summary */}
          <div className="mt-3">
            <p className="text-sm text-gray-700 leading-relaxed">{ext.summary}</p>
            <div className="flex items-center gap-3 mt-2">
              {ext.sentiment && (
                <span className={`text-xs font-medium ${SENTIMENT_COLORS[ext.sentiment]}`}>
                  {ext.sentiment}
                </span>
              )}
              {ext.relationshipDelta && ext.relationshipDelta !== 'maintained' && (
                <span className={`text-xs font-medium ${
                  ext.relationshipDelta === 'strengthened' ? 'text-green-600' :
                  ext.relationshipDelta === 'weakened' ? 'text-red-600' :
                  ext.relationshipDelta === 'new' ? 'text-blue-600' : 'text-gray-500'
                }`}>
                  {ext.relationshipDelta}
                </span>
              )}
            </div>
          </div>

          {/* Audio Features (voice items) */}
          {item.source === 'voice' && ext.audioFeatures && (
            <div className="flex flex-wrap gap-2 mt-2">
              <span className="px-2 py-1 rounded-md text-xs font-medium bg-violet-50 text-violet-700 border border-violet-200">
                {Math.floor(ext.audioFeatures.totalDuration / 60)}m {Math.floor(ext.audioFeatures.totalDuration % 60)}s
              </span>
              <span className={`px-2 py-1 rounded-md text-xs font-medium border ${
                ext.audioFeatures.averageEnergy === 'high' ? 'bg-orange-50 text-orange-700 border-orange-200' :
                ext.audioFeatures.averageEnergy === 'medium' ? 'bg-yellow-50 text-yellow-700 border-yellow-200' :
                'bg-gray-50 text-gray-600 border-gray-200'
              }`}>
                {ext.audioFeatures.averageEnergy} energy
              </span>
              <span className={`px-2 py-1 rounded-md text-xs font-medium border ${
                ext.audioFeatures.overallPace === 'fast' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                ext.audioFeatures.overallPace === 'moderate' ? 'bg-gray-50 text-gray-600 border-gray-200' :
                'bg-green-50 text-green-700 border-green-200'
              }`}>
                {ext.audioFeatures.overallPace} pace
              </span>
              {ext.audioFeatures.laughterInstances > 0 && (
                <span className="px-2 py-1 rounded-md text-xs font-medium bg-pink-50 text-pink-700 border border-pink-200">
                  {ext.audioFeatures.laughterInstances} laugh{ext.audioFeatures.laughterInstances !== 1 ? 's' : ''}
                </span>
              )}
            </div>
          )}

          {/* Extraction Details */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Commitments */}
            {(ext.myCommitments.length > 0 || ext.theirCommitments.length > 0) && (
              <ExtractSection icon={Target} title="Commitments" color="text-amber-600">
                {ext.myCommitments.map((c, i) => (
                  <div key={`my-${i}`} className="text-sm text-gray-700">
                    <span className="text-amber-600 font-medium">Mine:</span> {c.description}
                    {c.resolvedDate && <span className="text-gray-400 ml-1">({c.resolvedDate})</span>}
                  </div>
                ))}
                {ext.theirCommitments.map((c, i) => (
                  <div key={`their-${i}`} className="text-sm text-gray-700">
                    <span className="text-blue-600 font-medium">Theirs:</span> {c.description}
                    {c.resolvedDate && <span className="text-gray-400 ml-1">({c.resolvedDate})</span>}
                  </div>
                ))}
              </ExtractSection>
            )}

            {/* Standing Offers */}
            {ext.offers.length > 0 && (
              <ExtractSection icon={Handshake} title="Standing Offers" color="text-green-600">
                {ext.offers.map((o, i) => (
                  <div key={i} className="text-sm text-gray-700">
                    <span className={o.offeredBy === 'me' ? 'text-amber-600 font-medium' : 'text-blue-600 font-medium'}>
                      {o.offeredBy === 'me' ? 'I offered:' : 'They offered:'}
                    </span>{' '}
                    {o.description}
                  </div>
                ))}
              </ExtractSection>
            )}

            {/* Calendar Events — Editable + Add to Calendar */}
            {ext.calendarEvents.length > 0 && (
              <ExtractSection icon={Calendar} title="Calendar Events" color="text-cyan-600">
                {ext.calendarEvents.map((e, i) => {
                  const edits = editedCalEvents[i] || {}
                  const isAdded = addedCalEvents.has(i)
                  const isLoadingCal = calEventLoading === i

                  return (
                    <div key={i} className={`rounded-md border p-3 space-y-2 ${isAdded ? 'border-green-200 bg-green-50/50' : 'border-gray-200 bg-gray-50/50'}`}>
                      {/* Title */}
                      <input
                        type="text"
                        value={edits.title ?? e.title}
                        onChange={ev => updateCalEvent(i, 'title', ev.target.value)}
                        className="w-full text-sm font-medium text-gray-900 bg-transparent border-0 p-0 focus:outline-none focus:ring-0"
                        disabled={isAdded}
                      />

                      {/* Date + Time Row */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <input
                          type="date"
                          value={edits.date ?? e.date ?? ''}
                          onChange={ev => updateCalEvent(i, 'date', ev.target.value)}
                          className="text-xs text-gray-700 bg-white border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                          disabled={isAdded}
                        />
                        <input
                          type="time"
                          value={edits.startTime ?? e.startTime ?? ''}
                          onChange={ev => updateCalEvent(i, 'startTime', ev.target.value)}
                          className="text-xs text-gray-700 bg-white border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                          disabled={isAdded}
                        />
                        <span className="text-xs text-gray-400">—</span>
                        <input
                          type="time"
                          value={edits.endTime ?? e.endTime ?? ''}
                          onChange={ev => updateCalEvent(i, 'endTime', ev.target.value)}
                          className="text-xs text-gray-700 bg-white border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                          disabled={isAdded}
                        />
                      </div>

                      {/* Location */}
                      <div className="flex items-center gap-1.5">
                        <MapPin className="w-3 h-3 text-gray-400 flex-shrink-0" />
                        <input
                          type="text"
                          value={edits.location ?? e.location ?? ''}
                          onChange={ev => updateCalEvent(i, 'location', ev.target.value)}
                          placeholder="Location (optional)"
                          className="flex-1 text-xs text-gray-600 bg-transparent border-0 p-0 placeholder-gray-300 focus:outline-none focus:ring-0"
                          disabled={isAdded}
                        />
                      </div>

                      {/* Add to Calendar Button */}
                      <div className="flex items-center gap-2 pt-1">
                        {isAdded ? (
                          <span className="flex items-center gap-1.5 text-xs font-medium text-green-600">
                            <CheckCircle className="w-3.5 h-3.5" />
                            Added to Calendar
                          </span>
                        ) : (
                          <button
                            onClick={() => handleAddToCalendar(i)}
                            disabled={isLoadingCal}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-cyan-700 bg-cyan-50 hover:bg-cyan-100 border border-cyan-200 rounded-md transition-colors disabled:opacity-50"
                          >
                            {isLoadingCal ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <CalendarPlus className="w-3.5 h-3.5" />
                            )}
                            Add to Calendar
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
                {calEventError && (
                  <p className="text-xs text-red-600 mt-1">{calEventError}</p>
                )}
              </ExtractSection>
            )}

            {/* Scheduling Leads */}
            {ext.schedulingLeads.length > 0 && (
              <ExtractSection icon={Clock} title="Scheduling Leads" color="text-teal-600">
                {ext.schedulingLeads.map((s, i) => (
                  <div key={i} className="text-sm text-gray-700">
                    {s.description}
                    {s.timeframe && <span className="text-gray-400 ml-1">({s.timeframe})</span>}
                  </div>
                ))}
              </ExtractSection>
            )}

            {/* New Contacts */}
            {ext.newContactsMentioned.length > 0 && (
              <ExtractSection icon={Users} title="New Contacts" color="text-violet-600">
                {ext.newContactsMentioned.map((nc, i) => (
                  <div key={i} className="text-sm text-gray-700">
                    <span className="font-medium text-gray-900">{nc.name}</span>
                    {nc.org && <span className="text-gray-500"> at {nc.org}</span>}
                    {nc.title && <span className="text-gray-400"> — {nc.title}</span>}
                    <div className="text-xs text-gray-400 mt-0.5">{nc.context}</div>
                  </div>
                ))}
              </ExtractSection>
            )}

            {/* Org Intelligence */}
            {ext.orgIntelligence.length > 0 && (
              <ExtractSection icon={Radio} title="Org Intelligence" color="text-purple-600">
                {ext.orgIntelligence.map((o, i) => (
                  <div key={i} className="text-sm text-gray-700">
                    <span className="font-medium text-gray-900">{o.organization}:</span> {o.intelligence}
                  </div>
                ))}
              </ExtractSection>
            )}

            {/* Life Events */}
            {ext.lifeEvents.length > 0 && (
              <ExtractSection icon={Heart} title="Life Events" color="text-pink-600">
                {ext.lifeEvents.map((le, i) => (
                  <div key={i} className="text-sm text-gray-700">
                    {le.description}
                    {le.date && <span className="text-gray-400 ml-1">({le.date})</span>}
                  </div>
                ))}
              </ExtractSection>
            )}

            {/* Status Changes */}
            {ext.statusChanges.length > 0 && (
              <ExtractSection icon={Briefcase} title="Status Changes" color="text-orange-600">
                {ext.statusChanges.map((sc, i) => (
                  <div key={i} className="text-sm text-gray-700">
                    <span className="font-medium text-gray-900">{sc.person}:</span> {sc.description}
                  </div>
                ))}
              </ExtractSection>
            )}

            {/* Resources */}
            {ext.referencedResources.length > 0 && (
              <ExtractSection icon={BookOpen} title="Resources" color="text-indigo-600">
                {ext.referencedResources.map((r, i) => (
                  <div key={i} className="text-sm text-gray-700">
                    {r.description}
                    <span className="text-gray-400 ml-1">[{r.type}]</span>
                    {r.action !== 'reference_only' && (
                      <span className="text-xs text-amber-600 ml-1">{r.action.replace(/_/g, ' ')}</span>
                    )}
                  </div>
                ))}
              </ExtractSection>
            )}
          </div>

          {/* Topics */}
          {ext.topicsDiscussed.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {ext.topicsDiscussed.map((topic, i) => (
                <span key={i} className="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-600 border border-gray-200">
                  {topic}
                </span>
              ))}
            </div>
          )}

          {/* Relationship Notes */}
          {ext.relationshipNotes && (
            <div className="text-sm text-gray-500 italic border-l-2 border-gray-200 pl-3 mt-2">
              {ext.relationshipNotes}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 mt-4 pt-3 border-t border-gray-100">
            {isPending && (
              <>
                <button
                  onClick={onConfirm}
                  disabled={isLoading}
                  className="px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-md transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  Confirm
                </button>

                {!showDismissForm ? (
                  <button
                    onClick={() => setShowDismissForm(true)}
                    className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 hover:bg-gray-50 rounded-md transition-colors flex items-center gap-2"
                  >
                    <X className="w-4 h-4" />
                    Dismiss
                  </button>
                ) : (
                  <div className="flex items-center gap-2 flex-1">
                    <input
                      type="text"
                      value={dismissReason}
                      onChange={e => setDismissReason(e.target.value)}
                      placeholder="Reason (optional)..."
                      className="flex-1 px-3 py-2 text-sm bg-white border border-gray-200 rounded-md text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      onClick={() => { onDismiss(dismissReason || undefined); setShowDismissForm(false) }}
                      disabled={isLoading}
                      className="px-3 py-2 text-sm text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 rounded-md transition-colors disabled:opacity-50"
                    >
                      {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Dismiss'}
                    </button>
                    <button
                      onClick={() => setShowDismissForm(false)}
                      className="px-2 py-2 text-sm text-gray-400 hover:text-gray-600"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </>
            )}

            {isConfirmed && (
              <button
                onClick={onUndo}
                disabled={isLoading}
                className="px-4 py-2 text-sm font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-md transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Undo2 className="w-4 h-4" />}
                Undo
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function ExtractSection({
  icon: Icon,
  title,
  color,
  children,
}: {
  icon: typeof Target
  title: string
  color: string
  children: React.ReactNode
}) {
  return (
    <div className="p-3 rounded-lg bg-gray-50 border border-gray-100">
      <div className={`flex items-center gap-2 mb-2 ${color}`}>
        <Icon className="w-4 h-4" />
        <span className="text-xs font-medium uppercase tracking-wider">{title}</span>
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  )
}
