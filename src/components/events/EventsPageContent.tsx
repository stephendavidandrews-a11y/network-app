'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Calendar, Plus, MapPin } from 'lucide-react'
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

export function EventsPageContent({ events }: { events: EventRow[] }) {
  const [filter, setFilter] = useState<'all' | 'upcoming' | 'attending' | 'cfp'>('upcoming')

  const today = new Date().toISOString().split('T')[0]
  const filtered = events.filter(e => {
    if (filter === 'upcoming') return !e.dateStart || e.dateStart >= today
    if (filter === 'attending') return e.attending || e.speaking
    if (filter === 'cfp') return e.cfpStatus !== 'not_applicable' && e.cfpStatus !== 'submitted' && e.cfpStatus !== 'accepted'
    return true
  })

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Events</h1>
        <Link href="/events/new"
          className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700">
          <Plus className="h-4 w-4" /> Add Event
        </Link>
      </div>

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
                    {event.organizer && <span>{event.organizer}</span>}
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
    </div>
  )
}
