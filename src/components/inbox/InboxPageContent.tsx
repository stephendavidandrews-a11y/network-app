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
  Loader2,
  Plus,
  Send,
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
              isLoading={actionLoading === item.id}
              formatTime={formatTime}
            />
          ))}
        </div>
      )}
    </div>
  )
}

interface InboxCardProps {
  item: InboxItem
  expanded: boolean
  onToggle: () => void
  onConfirm: () => void
  onDismiss: (reason?: string) => void
  onUndo: () => void
  isLoading: boolean
  formatTime: (d: string) => string
}

function InboxCard({ item, expanded, onToggle, onConfirm, onDismiss, onUndo, isLoading, formatTime }: InboxCardProps) {
  const [dismissReason, setDismissReason] = useState('')
  const [showDismissForm, setShowDismissForm] = useState(false)
  const ext = item.extraction

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
        <SourceIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />

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
            <span className="text-sm text-gray-400 italic">
              {item.contactHint || 'Unknown contact'}
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

            {/* Calendar Events */}
            {ext.calendarEvents.length > 0 && (
              <ExtractSection icon={Calendar} title="Calendar Events" color="text-cyan-600">
                {ext.calendarEvents.map((e, i) => (
                  <div key={i} className="text-sm text-gray-700">
                    {e.title}
                    {e.date && <span className="text-gray-400 ml-1">{e.date}</span>}
                    {e.startTime && <span className="text-gray-400 ml-1">{e.startTime}</span>}
                  </div>
                ))}
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
