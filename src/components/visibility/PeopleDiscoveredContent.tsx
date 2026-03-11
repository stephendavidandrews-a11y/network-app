'use client'

import { useState, useEffect, useCallback } from 'react'
import { User, UserPlus, UserX, ExternalLink, RefreshCw, ChevronDown, ChevronRight, Briefcase, Building2, MessageSquare, Star } from 'lucide-react'

interface DiscoveredPerson {
  name: string
  title: string | null
  org: string | null
  contexts: string[]
  articleCount: number
  firstSeen: string
  mostRecent: string
  extractionIds: string[]
  confidence: string
  topArticle: {
    title: string
    publication: string | null
    url: string | null
    score: number
  } | null
}

export function PeopleDiscoveredContent() {
  const [people, setPeople] = useState<DiscoveredPerson[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [expandedPerson, setExpandedPerson] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [actionInProgress, setActionInProgress] = useState<string | null>(null)

  const fetchPeople = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/intel/people?status=new_potential&limit=50')
      const data = await res.json()
      setPeople(data.people || [])
      setTotal(data.total || 0)
    } catch (error) {
      console.error('Failed to fetch people:', error)
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetchPeople() }, [fetchPeople])

  const handleApprove = async (person: DiscoveredPerson, tier?: number) => {
    setActionInProgress(person.name)
    try {
      const res = await fetch('/api/intel/people/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ extractionIds: person.extractionIds, tier: tier || 3 }),
      })
      const data = await res.json()
      setMessage(data.message || `Added ${person.name}`)
      setPeople(prev => prev.filter(p => p.name !== person.name))
    } catch { setMessage('Failed to approve') }
    setActionInProgress(null)
  }

  const handleDismiss = async (person: DiscoveredPerson, reason?: string) => {
    setActionInProgress(person.name)
    try {
      const res = await fetch('/api/intel/people/dismiss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ extractionIds: person.extractionIds, reason }),
      })
      const data = await res.json()
      setMessage(data.message || `Dismissed ${person.name}`)
      setPeople(prev => prev.filter(p => p.name !== person.name))
    } catch { setMessage('Failed to dismiss') }
    setActionInProgress(null)
  }

  const confidenceColor = (c: string) => {
    if (c === 'high') return 'text-emerald-400 bg-emerald-400/10'
    if (c === 'medium') return 'text-amber-400 bg-amber-400/10'
    return 'text-slate-500 bg-slate-500/10'
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">People Discovered</h1>
          <p className="text-sm text-slate-500 mt-1">
            {total} people found in recent intelligence. Review and add to your network.
          </p>
        </div>
        <button onClick={fetchPeople} disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm text-slate-300 transition-colors">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {message && (
        <div className="mb-4 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-sm text-blue-300 flex items-center justify-between">
          <span>{message}</span>
          <button onClick={() => setMessage(null)} className="text-blue-400 hover:text-blue-300 ml-2 text-xs">dismiss</button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <RefreshCw className="h-5 w-5 animate-spin text-slate-600" />
          <span className="ml-3 text-slate-500 text-sm">Loading...</span>
        </div>
      ) : people.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <User className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No new people discovered. Run extraction to find contacts.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {people.map(person => {
            const isExpanded = expandedPerson === person.name
            const isActing = actionInProgress === person.name
            return (
              <div key={person.name} className="rounded-lg border border-slate-700/40 bg-slate-800/30 overflow-hidden hover:bg-slate-800/50 transition-colors">
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2.5 mb-1">
                        <div className="w-8 h-8 rounded-full bg-indigo-500/20 flex items-center justify-center shrink-0">
                          <User className="h-4 w-4 text-indigo-400" />
                        </div>
                        <div>
                          <h3 className="text-sm font-semibold text-slate-100">{person.name}</h3>
                          <div className="flex items-center gap-2 text-xs text-slate-500">
                            {person.title && (
                              <span className="flex items-center gap-1"><Briefcase className="h-3 w-3" />{person.title}</span>
                            )}
                            {person.org && (
                              <span className="flex items-center gap-1"><Building2 className="h-3 w-3" />{person.org}</span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Context / why they matter */}
                      {person.contexts.length > 0 && (
                        <p className="text-xs text-slate-400 mt-2 ml-10 leading-relaxed">
                          {person.contexts[0]}
                        </p>
                      )}

                      <div className="flex items-center gap-3 mt-2 ml-10">
                        {person.articleCount > 1 && (
                          <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 font-medium">
                            <Star className="h-3 w-3" /> {person.articleCount} articles
                          </span>
                        )}
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${confidenceColor(person.confidence)}`}>
                          {person.confidence} confidence
                        </span>
                        {person.topArticle && (
                          <span className="text-[10px] text-slate-600">
                            via {person.topArticle.publication || 'article'}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button onClick={() => handleApprove(person)} disabled={isActing}
                        title="Add to network (Tier 3)"
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-50 transition-colors">
                        <UserPlus className="h-3.5 w-3.5" /> Add
                      </button>
                      <button onClick={() => handleDismiss(person)} disabled={isActing}
                        title="Not relevant"
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-700/50 text-slate-400 hover:bg-red-500/10 hover:text-red-400 disabled:opacity-50 transition-colors">
                        <UserX className="h-3.5 w-3.5" /> Skip
                      </button>
                      <button onClick={() => setExpandedPerson(isExpanded ? null : person.name)}
                        className="p-1.5 rounded-md text-slate-600 hover:text-slate-300 transition-colors">
                        {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Expanded details */}
                {isExpanded && (
                  <div className="border-t border-slate-700/30 px-4 py-3 bg-slate-900/20 space-y-3">
                    {person.contexts.length > 1 && (
                      <div>
                        <div className="text-[10px] uppercase tracking-wider text-slate-600 font-semibold mb-1">All Contexts</div>
                        {person.contexts.map((ctx, i) => (
                          <p key={i} className="text-xs text-slate-400 leading-relaxed flex items-start gap-2 mb-1">
                            <MessageSquare className="h-3 w-3 mt-0.5 shrink-0 text-slate-600" />
                            {ctx}
                          </p>
                        ))}
                      </div>
                    )}
                    {person.topArticle && (
                      <div>
                        <div className="text-[10px] uppercase tracking-wider text-slate-600 font-semibold mb-1">Top Source</div>
                        <div className="flex items-center gap-2 text-xs text-slate-400">
                          <span>{person.topArticle.title}</span>
                          {person.topArticle.url && (
                            <a href={person.topArticle.url} target="_blank" rel="noopener noreferrer"
                              className="text-slate-600 hover:text-slate-300 transition-colors shrink-0">
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </div>
                      </div>
                    )}
                    <div className="flex gap-2">
                      <button onClick={() => handleApprove(person, 2)} disabled={isActing}
                        className="text-[10px] px-2 py-1 rounded bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 transition-colors">
                        Add as Tier 2
                      </button>
                      <button onClick={() => handleApprove(person, 1)} disabled={isActing}
                        className="text-[10px] px-2 py-1 rounded bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 transition-colors">
                        Add as Tier 1
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
