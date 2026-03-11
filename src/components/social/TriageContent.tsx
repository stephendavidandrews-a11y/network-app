'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, ChevronRight, UserPlus, Link2, Clock, X } from 'lucide-react'

type CommStats = {
  id: string
  phoneNumber: string
  contactId: string | null
  totalWeightedScore: number
  totalMessages: number
  messagesSent: number
  messagesReceived: number
  firstMessageDate: string | null
  lastMessageDate: string | null
  reciprocityRatio: number
  trend: string
  appleContactName: string | null
}

type SyncMeta = {
  id: string
  lastSuccessfulRun: string | null
  lastMessageRowId: number
  lastRunStatus: string
  messagesProcessed: number
} | null

type SampleMessage = {
  direction: string
  content: string
  timestamp: string
}

type SuggestedMatch = {
  id: string
  name: string
  title: string | null
  organization: string | null
  phone: string | null
  contactType: string
  score: number
  matchType: string
}

type Props = {
  mainQueue: CommStats[]
  warmLeads: CommStats[]
  syncMeta: SyncMeta
  totalContacts: number
}

export function TriageContent({ mainQueue, warmLeads, syncMeta, totalContacts }: Props) {
  const router = useRouter()
  const [tab, setTab] = useState<'main' | 'warm_leads'>('main')
  const [processed, setProcessed] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState<string | null>(null)
  const [expandedCard, setExpandedCard] = useState<string | null>(null)
  const [sampleMessages, setSampleMessages] = useState<Record<string, SampleMessage[]>>({})
  const [suggestions, setSuggestions] = useState<Record<string, SuggestedMatch[]>>({})
  const [appleNames, setAppleNames] = useState<Record<string, string>>({})
  const [newContactName, setNewContactName] = useState<Record<string, string>>({})
  const [newContactType, setNewContactType] = useState<Record<string, string>>({})
  const [linkContactType, setLinkContactType] = useState<Record<string, string>>({})

  const queue = tab === 'main' ? mainQueue : warmLeads
  const remaining = queue.filter(c => !processed.has(c.phoneNumber))
  const totalInQueue = queue.length
  const processedCount = processed.size

  useEffect(() => {
    if (expandedCard && !sampleMessages[expandedCard]) {
      loadSampleMessages(expandedCard)
      loadSuggestions(expandedCard)
    }
  }, [expandedCard])

  const loadSampleMessages = async (phone: string) => {
    try {
      const res = await fetch(`/api/social/triage?bucket=${tab}`)
      if (res.ok) {
        const data = await res.json()
        const entry = data.find((c: CommStats & { recentMessages: SampleMessage[] }) => c.phoneNumber === phone)
        if (entry?.recentMessages) {
          setSampleMessages(prev => ({ ...prev, [phone]: entry.recentMessages }))
        }
      }
    } catch {}
  }

  const loadSuggestions = async (phone: string) => {
    const entry = [...mainQueue, ...warmLeads].find(c => c.phoneNumber === phone)
    const name = entry?.appleContactName || appleNames[phone]
    if (!name) return
    try {
      const res = await fetch(`/api/social/triage/suggest?name=${encodeURIComponent(name)}`)
      if (res.ok) {
        const data = await res.json()
        setSuggestions(prev => ({ ...prev, [phone]: data }))
      }
    } catch {}
  }

  const handleAction = async (
    phone: string,
    action: 'match' | 'create' | 'dismiss' | 'defer',
    contactId?: string,
    name?: string,
    contactType?: string,
  ) => {
    setLoading(phone)
    try {
      const res = await fetch('/api/social/triage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumber: phone,
          action,
          contactId,
          name: name || newContactName[phone] || [...mainQueue, ...warmLeads].find(c => c.phoneNumber === phone)?.appleContactName || appleNames[phone],
          contactType: contactType || newContactType[phone] || 'personal',
        }),
      })
      if (res.ok) {
        setProcessed(prev => new Set([...prev, phone]))
        if (expandedCard === phone) setExpandedCard(null)
      }
    } catch {}
    setLoading(null)
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Unknown'
    try {
      return new Date(dateStr).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
      })
    } catch {
      return dateStr
    }
  }

  const formatDateShort = (dateStr: string | null) => {
    if (!dateStr) return ''
    try {
      return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' }).replace(',', '')
    } catch {
      return dateStr
    }
  }

  const reciprocityLabel = (ratio: number) => {
    if (ratio > 0.65) return { text: 'You initiate more', color: 'text-blue-400' }
    if (ratio < 0.35) return { text: 'They initiate more', color: 'text-emerald-400' }
    return { text: 'Balanced', color: 'text-slate-400' }
  }

  const trendBadge = (trend: string) => {
    if (trend === 'growing') return <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400">Growing</span>
    if (trend === 'fading') return <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400">Fading</span>
    return null
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Import Contacts from Texts</h1>
          <p className="text-sm text-slate-400 mt-1">
            Review people from your iMessage history and add them to your network
          </p>
        </div>
        {syncMeta && (
          <div className="text-right text-xs text-slate-500">
            <div>Last sync: {syncMeta.lastSuccessfulRun ? formatDate(syncMeta.lastSuccessfulRun) : 'Never'}</div>
            <div>Status: <span className={syncMeta.lastRunStatus === 'success' ? 'text-emerald-400' : 'text-amber-400'}>{syncMeta.lastRunStatus}</span></div>
            <div className="text-slate-500 tabular-nums">{syncMeta.messagesProcessed.toLocaleString()} messages processed</div>
          </div>
        )}
      </div>

      {/* Pipeline summary strip */}
      {totalInQueue > 0 && (
        <div className="mb-6 p-3 rounded-lg bg-[#1a1f2e] border border-slate-700/40">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6 text-xs">
              <span className="text-slate-400 font-medium uppercase tracking-wider" style={{ fontSize: '10px' }}>Progress</span>
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                <span className="text-blue-300 tabular-nums">{remaining.length}</span>
                <span className="text-slate-500">remaining</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <span className="text-emerald-300 tabular-nums">{processedCount}</span>
                <span className="text-slate-500">processed</span>
              </span>
            </div>
            {totalInQueue > 0 && (
              <span className="text-[11px] text-slate-400 tabular-nums">{Math.round((processedCount / totalInQueue) * 100)}% complete</span>
            )}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-6 border-b border-slate-700/40">
        <button
          onClick={() => setTab('main')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            tab === 'main' ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-400 hover:text-slate-300'
          }`}
        >
          Main Queue
          {mainQueue.length > 0 && (
            <span className={`ml-1.5 text-xs ${tab === 'main' ? 'text-blue-500' : 'text-slate-500'}`}>{mainQueue.length}</span>
          )}
        </button>
        <button
          onClick={() => setTab('warm_leads')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            tab === 'warm_leads' ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-400 hover:text-slate-300'
          }`}
        >
          Warm Leads
          {warmLeads.length > 0 && (
            <span className={`ml-1.5 text-xs ${tab === 'warm_leads' ? 'text-blue-500' : 'text-slate-500'}`}>{warmLeads.length}</span>
          )}
        </button>
        {remaining.length > 3 && (
          <button
            onClick={() => {
              remaining.forEach(c => setProcessed(prev => new Set([...prev, c.phoneNumber])))
            }}
            className="ml-auto px-3 py-1.5 text-[11px] font-medium text-slate-500 hover:text-slate-300 transition-colors"
          >
            Defer all remaining
          </button>
        )}
      </div>

      {/* Cards */}
      {remaining.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <UserPlus className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">
            {processedCount > 0 ? 'All done! Queue cleared.' : 'No contacts to review yet. Run a sync first.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {remaining.map(c => {
            const recip = reciprocityLabel(c.reciprocityRatio)
            const isExpanded = expandedCard === c.phoneNumber
            const msgs = sampleMessages[c.phoneNumber] || []
            const matchSuggestions = suggestions[c.phoneNumber] || []
            const contactName = c.appleContactName || appleNames[c.phoneNumber] || ''

            return (
              <div
                key={c.phoneNumber}
                className={`rounded-lg border border-slate-700/40 overflow-hidden transition-colors ${
                  isExpanded ? 'bg-[#1e2433]' : 'bg-[#1e2433] hover:bg-[#222840]'
                }`}
              >
                <button
                  onClick={() => setExpandedCard(isExpanded ? null : c.phoneNumber)}
                  className="w-full text-left p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div className="w-9 h-9 rounded-full bg-[#232838] flex items-center justify-center text-slate-400 text-xs font-medium shrink-0 mt-0.5">
                        {contactName ? contactName.split(' ').map(n => n[0]).join('').slice(0, 2) : '?'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2.5 mb-1">
                          {contactName ? (
                            <span className="text-sm font-medium text-slate-200">{contactName}</span>
                          ) : (
                            <span className="text-sm text-slate-500 italic">Unknown</span>
                          )}
                          <span className="text-[11px] text-slate-500 tabular-nums">{c.phoneNumber}</span>
                        </div>
                        <div className="flex items-center gap-3 text-[11px] text-slate-400">
                          <span className="tabular-nums">{c.totalMessages} messages</span>
                          <span>{formatDateShort(c.firstMessageDate)} — {formatDateShort(c.lastMessageDate)}</span>
                          <span className={recip.color}>{recip.text}</span>
                          {trendBadge(c.trend)}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
                      {isExpanded
                        ? <ChevronDown className="h-4 w-4 text-slate-500" />
                        : <ChevronRight className="h-4 w-4 text-slate-500" />}
                    </div>
                  </div>
                </button>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="border-t border-slate-700/30 px-4 py-4 space-y-4 bg-[#151a27]">
                    {/* Name input if unknown */}
                    {!contactName && (
                      <div>
                        <div className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold mb-2">Identify</div>
                        <input
                          type="text"
                          placeholder="Enter name..."
                          value={appleNames[c.phoneNumber] || ''}
                          onChange={(e) => {
                            setAppleNames(prev => ({ ...prev, [c.phoneNumber]: e.target.value }))
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="bg-[#232838] border border-slate-700/50 rounded-lg px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-slate-600 w-64"
                        />
                      </div>
                    )}

                    {/* Sample messages */}
                    {msgs.length > 0 && (
                      <div>
                        <div className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold mb-2">Recent Messages</div>
                        <div className="space-y-1.5">
                          {msgs.map((m, i) => (
                            <div key={i} className="text-xs pl-3 border-l-2 border-slate-700/50 py-0.5">
                              <span className={m.direction === 'sent' ? 'text-blue-400' : 'text-slate-400'}>
                                {m.direction === 'sent' ? 'You: ' : ''}
                              </span>
                              <span className="text-slate-300">
                                {m.content.length > 120 ? m.content.slice(0, 120) + '...' : m.content}
                              </span>
                              <span className="text-slate-600 text-[11px] ml-2">{formatDateShort(m.timestamp)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Match suggestions */}
                    {matchSuggestions.length > 0 && (
                      <div>
                        <div className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold mb-2">Possible Matches</div>
                        <div className="space-y-1.5">
                          {matchSuggestions.map((s) => (
                            <div key={s.id} className="flex items-center justify-between bg-[#232838] rounded-lg border border-slate-700/40 p-3">
                              <div className="flex items-center gap-2.5">
                                <Link2 className="h-3.5 w-3.5 text-slate-500" />
                                <span className="text-sm text-slate-200">{s.name}</span>
                                {s.organization && <span className="text-[11px] text-slate-500">{s.organization}</span>}
                                <span className={`text-[11px] px-1.5 py-0.5 rounded-full font-medium ${
                                  s.score > 0.8 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'
                                }`}>
                                  {Math.round(s.score * 100)}%
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <select
                                  value={linkContactType[`${c.phoneNumber}:${s.id}`] || s.contactType || 'personal'}
                                  onChange={(e) => {
                                    e.stopPropagation()
                                    setLinkContactType(prev => ({ ...prev, [`${c.phoneNumber}:${s.id}`]: e.target.value }))
                                  }}
                                  onClick={(e) => e.stopPropagation()}
                                  className="bg-[#1e2433] border border-slate-700/50 rounded-lg px-2 py-1.5 text-[11px] text-slate-300 focus:outline-none focus:border-slate-600"
                                >
                                  <option value="personal">Personal</option>
                                  <option value="professional">Professional</option>
                                  <option value="both">Both</option>
                                </select>
                                <button
                                  onClick={() => handleAction(c.phoneNumber, 'match', s.id, undefined, linkContactType[`${c.phoneNumber}:${s.id}`] || s.contactType || 'personal')}
                                  disabled={loading === c.phoneNumber}
                                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded-lg transition-all active:scale-95 disabled:opacity-50"
                                >
                                  Link
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Create new contact */}
                    <div>
                      <div className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold mb-2">Create New Contact</div>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          placeholder="Name"
                          value={newContactName[c.phoneNumber] || c.appleContactName || appleNames[c.phoneNumber] || ''}
                          onChange={(e) => setNewContactName(prev => ({ ...prev, [c.phoneNumber]: e.target.value }))}
                          className="bg-[#232838] border border-slate-700/50 rounded-lg px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-slate-600 flex-1"
                        />
                        <select
                          value={newContactType[c.phoneNumber] || 'personal'}
                          onChange={(e) => setNewContactType(prev => ({ ...prev, [c.phoneNumber]: e.target.value }))}
                          className="bg-[#232838] border border-slate-700/50 rounded-lg px-3 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-slate-600"
                        >
                          <option value="personal">Personal</option>
                          <option value="professional">Professional</option>
                          <option value="both">Both</option>
                        </select>
                        <button
                          onClick={() => handleAction(c.phoneNumber, 'create')}
                          disabled={loading === c.phoneNumber || !(newContactName[c.phoneNumber] || c.appleContactName || appleNames[c.phoneNumber])}
                          className="flex items-center gap-1.5 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium rounded-lg transition-all active:scale-95 disabled:opacity-50"
                        >
                          <UserPlus className="h-3.5 w-3.5" /> Create
                        </button>
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        onClick={() => handleAction(c.phoneNumber, 'defer')}
                        disabled={loading === c.phoneNumber}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium bg-[#232838] text-slate-400 hover:text-slate-300 border border-slate-700/40 transition-colors disabled:opacity-50"
                      >
                        <Clock className="h-3 w-3" /> Defer
                      </button>
                      <button
                        onClick={() => handleAction(c.phoneNumber, 'dismiss')}
                        disabled={loading === c.phoneNumber}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                      >
                        <X className="h-3 w-3" /> Dismiss
                      </button>
                    </div>
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
