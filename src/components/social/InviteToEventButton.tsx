'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

const TYPE_LABELS: Record<string, string> = {
  happy_hour: 'Happy Hour',
  dinner: 'Dinner',
  party: 'Party',
  golf: 'Golf',
  activity: 'Activity',
  other: 'Other',
}

export function InviteToEventButton({ contactId }: { contactId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [events, setEvents] = useState<Array<{ id: string; title: string | null; eventType: string; date: string; attendees?: Array<{ contact: { id: string } }> }>>([])
  const [loading, setLoading] = useState(false)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open && events.length === 0) {
      setLoading(true)
      fetch('/api/social/events?upcoming=true')
        .then(r => r.json())
        .then(data => { setEvents(Array.isArray(data) ? data : []); setLoading(false) })
        .catch(() => setLoading(false))
    }
  }, [open])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  async function invite(eventId: string, eventName: string) {
    setLoading(true)
    try {
      const res = await fetch(`/api/social/events/${eventId}/attendees`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactId, status: 'invited' }),
      })
      if (res.ok) {
        setFeedback({ type: 'success', msg: `Invited to ${eventName}` })
        router.refresh()
      } else {
        const data = await res.json().catch(() => ({}))
        const msg = String(data.error || '').includes('Unique constraint') ? 'Already invited to this event' : 'Failed to invite'
        setFeedback({ type: 'error', msg })
      }
    } catch {
      setFeedback({ type: 'error', msg: 'Network error' })
    }
    setLoading(false)
    setTimeout(() => { setFeedback(null); setOpen(false) }, 2000)
  }

  // Filter out events where this contact is already an attendee
  const available = events.filter(e =>
    !e.attendees?.some(a => a.contact?.id === contactId)
  )

  if (feedback) {
    return (
      <span className={`text-xs font-medium ${feedback.type === 'success' ? 'text-green-600' : 'text-red-500'}`}>
        {feedback.type === 'success' ? '\u2713' : '\u2717'} {feedback.msg}
      </span>
    )
  }

  return (
    <div ref={ref} className="relative inline-block">
      <button
        onClick={() => setOpen(!open)}
        className="rounded-md bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-600 hover:bg-blue-100 transition-colors"
      >
        + Invite to Event
      </button>
      {open && (
        <div className="absolute z-20 mt-1 right-0 w-72 rounded-md bg-white border border-gray-200 shadow-lg max-h-64 overflow-auto">
          {loading && available.length === 0 && (
            <div className="p-3 text-sm text-gray-500">Loading events...</div>
          )}
          {!loading && available.length === 0 && (
            <div className="p-3 text-sm text-gray-500">No upcoming events available</div>
          )}
          {available.map(e => (
            <button
              key={e.id}
              onClick={() => invite(e.id, e.title || TYPE_LABELS[e.eventType] || e.eventType)}
              disabled={loading}
              className="w-full text-left px-3 py-2.5 text-sm hover:bg-blue-50 transition-colors border-b border-gray-50 last:border-0 disabled:opacity-50"
            >
              <div className="font-medium text-gray-900">{e.title || TYPE_LABELS[e.eventType] || e.eventType}</div>
              <div className="text-xs text-gray-500">{e.date}{e.attendees ? ` \u00b7 ${e.attendees.length} invited` : ''}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
