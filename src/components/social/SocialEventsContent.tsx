'use client'

import { useState, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'

interface EventData {
  id: string
  eventType: string
  title: string | null
  date: string
  time: string | null
  venueId: string | null
  venueName: string | null
  coHosted: boolean
  notes: string | null
  publicVisibility: boolean
  location: string | null
  description: string | null
  attendees: { id: string; name: string; status: string }[]
}

interface VenueData {
  id: string
  name: string
  neighborhood: string | null
  city: string
  venueType: string
  goodFor: string[]
}

interface Props {
  events: EventData[]
  venues: VenueData[]
  contacts: { id: string; name: string }[]
}

const TYPE_LABELS: Record<string, string> = {
  happy_hour: 'Happy Hour',
  dinner: 'Dinner',
  party: 'Party',
  golf: 'Golf',
  activity: 'Activity',
  other: 'Other',
}

const TYPE_ICONS: Record<string, string> = {
  happy_hour: '\ud83c\udf7a',
  dinner: '\ud83c\udf7d\ufe0f',
  party: '\ud83c\udf89',
  golf: '\u26f3',
  activity: '\u26a1',
  other: '\ud83d\udcc5',
}

const STATUS_COLORS: Record<string, string> = {
  invited: 'bg-gray-100 text-gray-600',
  confirmed: 'bg-blue-100 text-blue-700',
  attended: 'bg-green-100 text-green-700',
  declined: 'bg-red-100 text-red-700',
  no_show: 'bg-yellow-100 text-yellow-700',
}

const EVENT_VENUE_RELEVANCE: Record<string, { venueTypes: string[]; keywords: string[] }> = {
  happy_hour: {
    venueTypes: ['bar', 'rooftop_bar', 'beer_garden', 'restaurant'],
    keywords: ['after-work', 'casual meetups', 'happy hours', 'late night', 'outdoor'],
  },
  dinner: {
    venueTypes: ['restaurant'],
    keywords: ['formal networking', 'small groups', 'large groups', 'private events', 'quiet conversation'],
  },
  party: {
    venueTypes: ['bar', 'rooftop_bar', 'beer_garden', 'restaurant'],
    keywords: ['large groups', 'private events', 'late night', 'high-energy', 'outdoor'],
  },
  golf: {
    venueTypes: ['golf_course', 'golf_simulator', 'golf'],
    keywords: ['golf', 'outdoor', 'sports', 'activity'],
  },
  activity: {
    venueTypes: ['activity', 'activity_venue', 'park'],
    keywords: ['outdoor', 'sports', 'activity'],
  },
  other: { venueTypes: [], keywords: [] },
}

function scoreVenue(venue: VenueData, eventType: string): number {
  const relevance = EVENT_VENUE_RELEVANCE[eventType]
  if (!relevance || (relevance.venueTypes.length === 0 && relevance.keywords.length === 0)) return 0
  let score = 0
  if (relevance.venueTypes.includes(venue.venueType)) score += 10
  for (const kw of relevance.keywords) {
    if (venue.goodFor.some(g => g.toLowerCase().includes(kw.toLowerCase()))) score += 2
  }
  return score
}

export function SocialEventsContent({ events, venues, contacts }: Props) {
  const router = useRouter()
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [addingTo, setAddingTo] = useState<string | null>(null)

  // === Attendee management ===
  async function addAttendee(eventId: string, contactId: string) {
    await fetch(`/api/social/events/${eventId}/attendees`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contactId, status: 'invited' }),
    })
    router.refresh()
  }

  async function removeAttendee(eventId: string, contactId: string) {
    await fetch(`/api/social/events/${eventId}/attendees?contactId=${contactId}`, {
      method: 'DELETE',
    })
    router.refresh()
  }

  async function updateAttendeeStatus(eventId: string, contactId: string, status: string) {
    await fetch(`/api/social/events/${eventId}/attendees`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contactId, status }),
    })
    router.refresh()
  }

  // === Event CRUD ===
  async function handleCreate(e: React.FormEvent<HTMLFormElement>, pendingAttendeeIds: string[]) {
    e.preventDefault()
    setSaving(true)
    const form = new FormData(e.currentTarget)
    try {
      const res = await fetch('/api/social/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventType: form.get('eventType'),
          title: form.get('title') || null,
          date: form.get('date'),
          time: form.get('time') || null,
          venueId: form.get('venueId') || null,
          venueName: form.get('venueName') || null,
          coHosted: form.get('coHosted') === 'true',
          notes: form.get('notes') || null,
          publicVisibility: form.get('publicVisibility') === 'true',
          location: form.get('location') || null,
          description: form.get('description') || null,
        }),
      })
      if (res.ok) {
        const newEvent = await res.json()
        for (const contactId of pendingAttendeeIds) {
          await fetch(`/api/social/events/${newEvent.id}/attendees`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contactId, status: 'invited' }),
          })
        }
        setShowForm(false)
        router.refresh()
      }
    } catch (err) {
      alert('Error: ' + err)
    }
    setSaving(false)
  }

  async function handleEdit(e: React.FormEvent<HTMLFormElement>, id: string) {
    e.preventDefault()
    setSaving(true)
    const form = new FormData(e.currentTarget)
    try {
      const res = await fetch(`/api/social/events/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventType: form.get('eventType'),
          title: form.get('title') || null,
          date: form.get('date'),
          time: form.get('time') || null,
          venueId: form.get('venueId') || null,
          venueName: form.get('venueName') || null,
          coHosted: form.get('coHosted') === 'true',
          notes: form.get('notes') || null,
          publicVisibility: form.get('publicVisibility') === 'true',
          location: form.get('location') || null,
          description: form.get('description') || null,
        }),
      })
      if (res.ok) {
        setEditingId(null)
        router.refresh()
      } else {
        const data = await res.json()
        alert(data.error || 'Failed to save')
      }
    } catch (err) {
      alert('Error: ' + err)
    }
    setSaving(false)
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this event?')) return
    setDeleting(id)
    try {
      const res = await fetch(`/api/social/events/${id}`, { method: 'DELETE' })
      if (res.ok) router.refresh()
    } catch (err) {
      alert('Error: ' + err)
    }
    setDeleting(null)
  }

  // === Contact Picker (inner component with access to contacts/router) ===
  function ContactPicker({ eventId, excludeIds, onAddPending }: {
    eventId?: string
    excludeIds: Set<string>
    onAddPending?: (id: string, name: string) => void
  }) {
    const [search, setSearch] = useState('')
    const filtered = search.length > 0
      ? contacts.filter(c => !excludeIds.has(c.id) && c.name.toLowerCase().includes(search.toLowerCase())).slice(0, 8)
      : []

    return (
      <div className="relative">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search contacts to invite..."
          className="w-full rounded-md border border-gray-200 px-3 py-1.5 text-sm focus:border-blue-300 focus:ring-1 focus:ring-blue-300"
        />
        {filtered.length > 0 && (
          <div className="absolute z-10 mt-1 w-full rounded-md bg-white border border-gray-200 shadow-lg max-h-48 overflow-auto">
            {filtered.map(c => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  if (eventId) addAttendee(eventId, c.id)
                  else if (onAddPending) onAddPending(c.id, c.name)
                  setSearch('')
                }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 transition-colors"
              >
                {c.name}
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  // === Event Form ===
  function EventForm({ event, onSubmit, onCancel, isNew }: {
    event?: EventData
    onSubmit: (e: React.FormEvent<HTMLFormElement>, pendingIds: string[]) => void
    onCancel: () => void
    isNew: boolean
  }) {
    const locationRef = useRef<HTMLInputElement>(null)
    const [eventType, setEventType] = useState(event?.eventType || 'happy_hour')
    const [pendingAttendees, setPendingAttendees] = useState<{ id: string; name: string }[]>([])

    const { suggested, others } = useMemo(() => {
      const scored = venues.map(v => ({ ...v, score: scoreVenue(v, eventType) }))
      const suggested = scored.filter(v => v.score > 0).sort((a, b) => b.score - a.score)
      const suggestedIds = new Set(suggested.map(v => v.id))
      const others = scored.filter(v => !suggestedIds.has(v.id))
      return { suggested, others }
    }, [eventType])

    function handleVenueChange(e: React.ChangeEvent<HTMLSelectElement>) {
      const venueId = e.target.value
      if (!venueId || !locationRef.current) return
      const venue = venues.find(v => v.id === venueId)
      if (!venue) return
      const suggestion = venue.neighborhood
        ? (venue.city === 'Washington, DC' ? venue.neighborhood : `${venue.neighborhood}, ${venue.city}`)
        : venue.city
      const current = locationRef.current.value.trim()
      const isAutoFilled = !current || venues.some(v =>
        v.neighborhood === current || v.city === current ||
        (v.neighborhood && v.city && `${v.neighborhood}, ${v.city}` === current)
      )
      if (isAutoFilled) locationRef.current.value = suggestion
    }

    const excludeIds = new Set([
      ...(event?.attendees || []).map(a => a.id),
      ...pendingAttendees.map(a => a.id),
    ])

    return (
      <form onSubmit={(e) => onSubmit(e, pendingAttendees.map(a => a.id))} className="rounded-lg bg-white p-5 shadow-sm space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
            <select name="eventType" value={eventType} onChange={(e) => setEventType(e.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm">
              <option value="happy_hour">Happy Hour</option>
              <option value="dinner">Dinner</option>
              <option value="party">Party</option>
              <option value="golf">Golf</option>
              <option value="activity">Activity</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
            <input name="title" defaultValue={event?.title || ''} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" placeholder="Thursday Happy Hour" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date *</label>
            <input name="date" type="date" required defaultValue={event?.date || ''} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Time</label>
            <input name="time" type="time" defaultValue={event?.time || ''} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Venue</label>
            <select name="venueId" defaultValue={event?.venueId || ''} onChange={handleVenueChange} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm">
              <option value="">Select venue</option>
              {suggested.length > 0 && (
                <optgroup label={`Suggested for ${TYPE_LABELS[eventType] || eventType}`}>
                  {suggested.map(v => (
                    <option key={v.id} value={v.id}>{v.name}{v.neighborhood ? ` (${v.neighborhood})` : ''}</option>
                  ))}
                </optgroup>
              )}
              <optgroup label={suggested.length > 0 ? 'Other venues' : 'All venues'}>
                {others.map(v => (
                  <option key={v.id} value={v.id}>{v.name}{v.neighborhood ? ` (${v.neighborhood})` : ''}</option>
                ))}
              </optgroup>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Or venue name</label>
            <input name="venueName" defaultValue={event?.venueName || ''} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" placeholder="New place name" />
          </div>
        </div>

        <div className="border-t border-gray-100 pt-4">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Public Events Page</div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Location <span className="font-normal text-gray-400">(auto-filled from venue)</span></label>
              <input ref={locationRef} name="location" defaultValue={event?.location || ''} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" placeholder="Dupont Circle area" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <input name="description" defaultValue={event?.description || ''} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" placeholder="Casual drinks with friends" />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <input type="checkbox" name="coHosted" value="true" id={`coHosted-${event?.id || 'new'}`} defaultChecked={event?.coHosted || false} />
            <label htmlFor={`coHosted-${event?.id || 'new'}`} className="text-sm text-gray-700">Co-hosted</label>
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" name="publicVisibility" value="true" id={`public-${event?.id || 'new'}`} defaultChecked={event?.publicVisibility || false} />
            <label htmlFor={`public-${event?.id || 'new'}`} className="text-sm text-gray-700">Show on public events page</label>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
          <textarea name="notes" rows={2} defaultValue={event?.notes || ''} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
        </div>

        {/* Invite People section */}
        <div className="border-t border-gray-100 pt-4">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
            Invite People {isNew && pendingAttendees.length > 0 && <span className="text-blue-600">({pendingAttendees.length})</span>}
          </div>

          {!isNew && event && event.attendees.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {event.attendees.map(a => (
                <div key={a.id} className={`flex items-center gap-1 rounded-full pl-3 pr-1 py-1 ${STATUS_COLORS[a.status] || STATUS_COLORS.invited}`}>
                  <span className="text-xs font-medium">{a.name}</span>
                  <select
                    value={a.status}
                    onChange={(ev) => updateAttendeeStatus(event.id, a.id, ev.target.value)}
                    className="text-[10px] bg-transparent border-none focus:ring-0 p-0 pr-5 cursor-pointer"
                  >
                    <option value="invited">Invited</option>
                    <option value="confirmed">Confirmed</option>
                    <option value="attended">Attended</option>
                    <option value="declined">Declined</option>
                    <option value="no_show">No Show</option>
                  </select>
                  <button type="button" onClick={() => removeAttendee(event.id, a.id)} className="text-current opacity-40 hover:opacity-100 text-sm leading-none px-0.5">&times;</button>
                </div>
              ))}
            </div>
          )}

          {isNew && pendingAttendees.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {pendingAttendees.map(a => (
                <div key={a.id} className="flex items-center gap-1 rounded-full bg-blue-50 pl-3 pr-1 py-1">
                  <span className="text-xs font-medium text-blue-700">{a.name}</span>
                  <button type="button" onClick={() => setPendingAttendees(prev => prev.filter(p => p.id !== a.id))} className="text-blue-400 hover:text-red-500 text-sm leading-none px-0.5">&times;</button>
                </div>
              ))}
            </div>
          )}

          <ContactPicker
            eventId={!isNew ? event?.id : undefined}
            excludeIds={excludeIds}
            onAddPending={isNew ? (id, name) => setPendingAttendees(prev => [...prev, { id, name }]) : undefined}
          />
        </div>

        <div className="flex gap-2">
          <button type="submit" disabled={saving} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            {saving ? 'Saving...' : isNew ? 'Create Event' : 'Save Changes'}
          </button>
          <button type="button" onClick={onCancel} className="rounded-md bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200">
            Cancel
          </button>
        </div>
      </form>
    )
  }

  // === Main Render ===
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Social Events</h1>
        <button
          onClick={() => { setShowForm(!showForm); setEditingId(null); setAddingTo(null) }}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          {showForm ? 'Cancel' : 'New Event'}
        </button>
      </div>

      {showForm && (
        <EventForm
          isNew={true}
          onSubmit={handleCreate}
          onCancel={() => setShowForm(false)}
        />
      )}

      <div className="space-y-4">
        {events.map(e => (
          <div key={e.id}>
            {editingId === e.id ? (
              <EventForm
                event={e}
                isNew={false}
                onSubmit={(ev, _ids) => handleEdit(ev, e.id)}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <div className="rounded-lg bg-white p-5 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="text-2xl">{TYPE_ICONS[e.eventType] || TYPE_ICONS.other}</div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-gray-900">{e.title || TYPE_LABELS[e.eventType] || e.eventType}</span>
                      {e.publicVisibility && (
                        <span className="rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-700">PUBLIC</span>
                      )}
                    </div>
                    <div className="text-sm text-gray-500">
                      {e.date}{e.time ? ` at ${e.time}` : ''}{e.venueName ? ` \u00b7 ${e.venueName}` : ''}
                      {e.coHosted && ' \u00b7 Co-hosted'}
                      {e.location && ` \u00b7 ${e.location}`}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-gray-400 mr-1">{e.attendees.length} invited</span>
                    <button
                      onClick={() => setAddingTo(addingTo === e.id ? null : e.id)}
                      className={`rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${addingTo === e.id ? 'bg-blue-100 text-blue-700' : 'text-blue-600 hover:bg-blue-50'}`}
                    >
                      + Invite
                    </button>
                    <button
                      onClick={() => { setEditingId(e.id); setShowForm(false); setAddingTo(null) }}
                      className="rounded-md px-2 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(e.id)}
                      disabled={deleting === e.id}
                      className="rounded-md px-2 py-1.5 text-xs font-medium text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
                    >
                      {deleting === e.id ? '...' : 'Delete'}
                    </button>
                  </div>
                </div>

                {/* Attendees with clickable status */}
                {e.attendees.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {e.attendees.map(a => (
                      <div key={a.id} className="relative group">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs cursor-pointer ${STATUS_COLORS[a.status] || STATUS_COLORS.invited}`}>
                          {a.name}
                        </span>
                        <select
                          value={a.status}
                          onChange={(ev) => updateAttendeeStatus(e.id, a.id, ev.target.value)}
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                          title={`Change status for ${a.name}`}
                        >
                          <option value="invited">Invited</option>
                          <option value="confirmed">Confirmed</option>
                          <option value="attended">Attended</option>
                          <option value="declined">Declined</option>
                          <option value="no_show">No Show</option>
                        </select>
                      </div>
                    ))}
                  </div>
                )}

                {/* Inline invite panel */}
                {addingTo === e.id && (
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <ContactPicker
                      eventId={e.id}
                      excludeIds={new Set(e.attendees.map(a => a.id))}
                    />
                  </div>
                )}

                {e.description && <p className="mt-2 text-sm text-gray-600 italic">{e.description}</p>}
                {e.notes && <p className="mt-2 text-xs text-gray-500">{e.notes}</p>}
              </div>
            )}
          </div>
        ))}
      </div>

      {events.length === 0 && !showForm && (
        <p className="text-center py-12 text-gray-500">No events yet. Create your first one!</p>
      )}
    </div>
  )
}
