'use client'

import Link from 'next/link'
import { useState, useEffect } from 'react'
import { Calendar, Plus, MapPin, Search, ExternalLink, Star, X, Sparkles, Settings2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDate } from '@/lib/utils'

interface EventRow {
  id: string
  name: string
  organizer: string | null
  location: string | null
  dateStart: string | null
  dateEnd: string | null
  eventType: string | null
  topics: string[]
  attending: boolean
  speaking: boolean
  cfpDeadline: string | null
  cfpStatus: string
  hasSpeakingOpportunity: boolean
  contactsAttending: string[]
}

interface DiscoveredEvent {
  id: string
  rawTitle: string
  rawDescription: string | null
  rawDate: string | null
  rawLocation: string | null
  rawUrl: string | null
  scrapedAt: string
  status: string
  topicRelevanceScore: number | null
  classificationNotes: string | null
  hasCfp: boolean
  cfpDeadline: string | null
  sourceName: string
  sourceCategory: string
}

interface DiscoveryStats {
  new?: number
  classified?: number
  promoted?: number
  dismissed?: number
}

export function EventsPageContent({ events }: { events: EventRow[] }) {
  const [tab, setTab] = useState<'pipeline' | 'discovery'>('pipeline')
  const [filter, setFilter] = useState<'all' | 'upcoming' | 'attending' | 'cfp'>('upcoming')
  const [discoveries, setDiscoveries] = useState<DiscoveredEvent[]>([])
  const [discoveryStats, setDiscoveryStats] = useState<DiscoveryStats>({})
  const [discoveryFilter, setDiscoveryFilter] = useState<string>('classified')
  const [discoveryLoading, setDiscoveryLoading] = useState(false)
  const [classifying, setClassifying] = useState(false)

  const today = new Date().toISOString().split('T')[0]

  const filtered = events.filter(e => {
    if (filter === 'upcoming') return !e.dateStart || e.dateStart >= today
    if (filter === 'attending') return e.attending || e.speaking
    if (filter === 'cfp') return e.cfpStatus !== 'not_applicable' && e.cfpStatus !== 'submitted' && e.cfpStatus !== 'accepted'
    return true
  })

  useEffect(() => {
    if (tab === 'discovery') loadDiscoveries()
  }, [tab, discoveryFilter])

  async function loadDiscoveries() {
    setDiscoveryLoading(true)
    try {
      const params = new URLSearchParams()
      if (discoveryFilter && discoveryFilter !== 'all') params.set('status', discoveryFilter)
      params.set('limit', '100')
      const res = await fetch(`/api/visibility/discovered?${params}`)
      const data = await res.json()
      setDiscoveries(data.events || [])
      setDiscoveryStats(data.stats || {})
    } catch (error) {
      console.error('Failed to load discoveries:', error)
    } finally {
      setDiscoveryLoading(false)
    }
  }

  async function handleClassify() {
    setClassifying(true)
    try {
      const res = await fetch('/api/visibility/discovered/classify', { method: 'POST', credentials: 'include' })
      const data = await res.json()
      alert(`Classified ${data.classified} events, dismissed ${data.dismissed}`)
      loadDiscoveries()
    } catch (error) {
      console.error('Classification failed:', error)
    } finally {
      setClassifying(false)
    }
  }

  async function handlePromote(id: string) {
    try {
      const res = await fetch(`/api/visibility/discovered/${id}/promote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
        credentials: 'include',
      })
      if (res.ok) {
        loadDiscoveries()
      } else {
        const data = await res.json().catch(() => ({}))
        alert(`Promote failed: ${data.error || res.statusText}`)
      }
    } catch (error) {
      console.error('Promote failed:', error)
      alert('Promote failed: ' + String(error))
    }
  }

  async function handleDismiss(id: string) {
    try {
      await fetch(`/api/visibility/discovered/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'dismissed', dismissedReason: 'Manual dismissal' }),
      })
      loadDiscoveries()
    } catch (error) {
      console.error('Dismiss failed:', error)
    }
  }

  function decodeEntities(text: string): string {
    return text
      .replace(/&#8211;?/g, '–')
      .replace(/&#8212;?/g, '—')
      .replace(/&#8216;?/g, '‘')
      .replace(/&#8217;?/g, '’')
      .replace(/&#8220;?/g, '“')
      .replace(/&#8221;?/g, '”')
      .replace(/&#038;?/g, '&')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'")
  }

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Events</h1>
        <div className="flex items-center gap-2">
          {tab === 'discovery' && (
            <Link href="/events/sources"
              className="flex items-center gap-1.5 rounded-md border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50">
              <Settings2 className="h-4 w-4" /> Manage Sources
            </Link>
          )}
          <Link href="/events/new"
            className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700">
            <Plus className="h-4 w-4" /> Add Event
          </Link>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        <button onClick={() => setTab('pipeline')}
          className={cn('px-4 py-2 text-sm font-medium border-b-2 transition-colors',
            tab === 'pipeline' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700')}>
          Pipeline
        </button>
        <button onClick={() => setTab('discovery')}
          className={cn('px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5',
            tab === 'discovery' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700')}>
          Discovery
          {(discoveryStats.new || 0) > 0 && (
            <span className="rounded-full bg-amber-100 text-amber-700 px-1.5 py-0.5 text-xs font-semibold">
              {discoveryStats.new}
            </span>
          )}
        </button>
      </div>

      {tab === 'pipeline' ? (
        <>
          <div className="flex gap-2">
            {(['all', 'upcoming', 'attending', 'cfp'] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={cn('rounded-md border px-3 py-1.5 text-xs font-medium',
                  filter === f ? 'bg-blue-600 text-white border-blue-600' : 'text-gray-600 hover:bg-gray-50')}>
                {f === 'all' ? 'All' : f === 'upcoming' ? 'Upcoming' : f === 'attending' ? 'Attending' : 'Open CFPs'}
              </button>
            ))}
          </div>

          {filtered.length === 0 ? (
            <div className="rounded-lg border bg-white p-8 text-center text-gray-500">
              <Calendar className="h-8 w-8 mx-auto mb-2 text-gray-300" />
              <p>No events found</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map(event => (
                <Link key={event.id} href={`/events/${event.id}`}
                  className="block rounded-lg border bg-white p-4 hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-gray-900">{event.name}</h3>
                        {event.attending && <span className="rounded bg-green-50 px-1.5 py-0.5 text-xs text-green-600">Attending</span>}
                        {event.speaking && <span className="rounded bg-blue-50 px-1.5 py-0.5 text-xs text-blue-600">Speaking</span>}
                        {event.eventType && <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">{event.eventType}</span>}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                        {event.dateStart && <span>{formatDate(event.dateStart)}{event.dateEnd && event.dateEnd !== event.dateStart ? ` — ${formatDate(event.dateEnd)}` : ''}</span>}
                        {event.location && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{event.location}</span>}
                      </div>
                      {event.topics.length > 0 && (
                        <div className="flex gap-1 mt-2">
                          {event.topics.map(t => (
                            <span key={t} className="rounded bg-violet-50 px-1.5 py-0.5 text-xs text-violet-600">{t}</span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="text-right ml-4">
                      {event.cfpDeadline && event.cfpStatus !== 'not_applicable' && (
                        <div>
                          <p className="text-xs text-amber-600 font-medium">CFP: {formatDate(event.cfpDeadline)}</p>
                          <p className="text-xs text-gray-400">{event.cfpStatus.replace(/_/g, ' ')}</p>
                        </div>
                      )}
                      {event.contactsAttending.length > 0 && (
                        <p className="text-xs text-gray-400 mt-1">{event.contactsAttending.length} contacts</p>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="flex items-center gap-4 text-xs text-gray-500">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-400"></span> {discoveryStats.new || 0} new</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-400"></span> {discoveryStats.classified || 0} classified</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-green-400"></span> {discoveryStats.promoted || 0} promoted</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-gray-300"></span> {discoveryStats.dismissed || 0} dismissed</span>
            <div className="ml-auto flex gap-2">
              {(discoveryStats.new || 0) > 0 && (
                <button onClick={handleClassify} disabled={classifying}
                  className="flex items-center gap-1 rounded-md bg-violet-600 px-3 py-1 text-xs font-medium text-white hover:bg-violet-700 disabled:opacity-50">
                  <Sparkles className="h-3 w-3" />
                  {classifying ? 'Classifying...' : 'Classify New'}
                </button>
              )}
            </div>
          </div>

          <div className="flex gap-2">
            {(['all', 'new', 'classified', 'promoted', 'dismissed'] as const).map(f => (
              <button key={f} onClick={() => setDiscoveryFilter(f)}
                className={cn('rounded-md border px-3 py-1.5 text-xs font-medium',
                  discoveryFilter === f ? 'bg-blue-600 text-white border-blue-600' : 'text-gray-600 hover:bg-gray-50')}>
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>

          {discoveryLoading ? (
            <div className="rounded-lg border bg-white p-8 text-center text-gray-400">Loading...</div>
          ) : discoveries.length === 0 ? (
            <div className="rounded-lg border bg-white p-8 text-center text-gray-500">
              <Search className="h-8 w-8 mx-auto mb-2 text-gray-300" />
              <p>No discoveries found</p>
              <p className="text-xs text-gray-400 mt-1">Sources run automatically at 2:30 AM, or trigger manually from Manage Sources</p>
            </div>
          ) : (
            <div className="space-y-3">
              {discoveries.map(d => (
                <div key={d.id} className="rounded-lg border bg-white p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm font-semibold text-gray-900">{decodeEntities(d.rawTitle)}</h3>
                        {d.topicRelevanceScore !== null && (
                          <span className={cn('rounded px-1.5 py-0.5 text-xs font-medium',
                            d.topicRelevanceScore >= 7 ? 'bg-green-50 text-green-700' :
                            d.topicRelevanceScore >= 5 ? 'bg-blue-50 text-blue-700' :
                            'bg-gray-100 text-gray-500')}>
                            {d.topicRelevanceScore}/10
                          </span>
                        )}
                        {d.hasCfp && <span className="rounded bg-amber-50 px-1.5 py-0.5 text-xs text-amber-600 font-medium">CFP</span>}
                        <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">{d.sourceName}</span>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                        {d.rawDate && <span>{d.rawDate}</span>}
                        {d.rawLocation && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{d.rawLocation}</span>}
                        {d.cfpDeadline && <span className="text-amber-600">CFP deadline: {d.cfpDeadline}</span>}
                      </div>
                      {d.rawDescription && (
                        <p className="mt-1.5 text-xs text-gray-500 line-clamp-2">{d.rawDescription}</p>
                      )}
                      {d.classificationNotes && (
                        <p className="mt-1 text-xs text-violet-600 italic">{d.classificationNotes}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 ml-4 shrink-0">
                      {d.status === 'classified' && (
                        <>
                          <button onClick={() => handlePromote(d.id)}
                            className="flex items-center gap-1 rounded-md bg-green-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-green-700">
                            <Star className="h-3 w-3" /> Promote
                          </button>
                          <button onClick={() => handleDismiss(d.id)}
                            className="flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs text-gray-500 hover:bg-gray-50">
                            <X className="h-3 w-3" /> Dismiss
                          </button>
                        </>
                      )}
                      {d.rawUrl && (
                        <a href={d.rawUrl} target="_blank" rel="noopener noreferrer"
                          className="rounded-md border p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-50">
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
