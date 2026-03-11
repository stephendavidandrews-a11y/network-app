'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Loader2,
  Plus,
  Trash2,
  UserPlus,
  AlertTriangle,
  Quote,
  ArrowRightLeft,
  CalendarPlus,
  Clock,
  ExternalLink,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { DebriefExtraction, DebriefCommitment, DebriefCalendarEvent } from '@/types'

interface VoiceDebriefReviewProps {
  contactId: string
  contactName: string
  extraction: DebriefExtraction
  transcript: string
}

const CONFIDENCE_BADGE: Record<string, { label: string; color: string }> = {
  high: { label: 'High', color: 'bg-green-100 text-green-700' },
  medium: { label: 'Med', color: 'bg-amber-100 text-amber-700' },
  low: { label: 'Low', color: 'bg-gray-100 text-gray-500' },
}

function formatTime12h(time24: string): string {
  const [h, m] = time24.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`
}

export function VoiceDebriefReview({
  contactId,
  contactName,
  extraction,
  transcript,
}: VoiceDebriefReviewProps) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [showTranscript, setShowTranscript] = useState(false)
  const [containsNonpublic, setContainsNonpublic] = useState(false)

  // Editable state from extraction
  const [summary, setSummary] = useState(extraction.summary)

  // My commitments (Stephen's promises)
  const [myCommitments, setMyCommitments] = useState<DebriefCommitment[]>(
    (extraction.myCommitments || []).map(c => ({
      description: c.description,
      originalWords: c.originalWords || '',
      resolvedDate: c.resolvedDate || null,
      resolvedTime: c.resolvedTime || null,
      confidence: c.confidence || 'medium',
      dueDate: c.dueDate || c.resolvedDate || '',
    }))
  )

  // Contact's commitments (things they promised Stephen)
  const [contactCommitments, setContactCommitments] = useState<DebriefCommitment[]>(
    (extraction.contactCommitments || []).map(c => ({
      description: c.description,
      originalWords: c.originalWords || '',
      resolvedDate: c.resolvedDate || null,
      resolvedTime: c.resolvedTime || null,
      confidence: c.confidence || 'medium',
      dueDate: c.dueDate || c.resolvedDate || '',
    }))
  )

  // Calendar events
  const [calendarEvents, setCalendarEvents] = useState<(DebriefCalendarEvent & { addedToCalendar?: boolean })[]>(
    (extraction.calendarEvents || []).map(e => ({
      ...e,
      addedToCalendar: false,
    }))
  )
  const [addingToCalendar, setAddingToCalendar] = useState<number | null>(null)

  // New contacts — track which have been created inline
  const [createdContacts, setCreatedContacts] = useState<Set<number>>(new Set())
  const [creatingContact, setCreatingContact] = useState<number | null>(null)

  const [followUpRequired, setFollowUpRequired] = useState(
    (extraction.followUps || []).length > 0
  )
  const [followUpDescription, setFollowUpDescription] = useState(
    (extraction.followUps || []).map(f => f.description).join('; ')
  )
  const [interactionType, setInteractionType] = useState<string>('meeting')

  // Commitment management helpers
  const addMyCommitment = () => {
    setMyCommitments([...myCommitments, {
      description: '', originalWords: '', resolvedDate: null, resolvedTime: null, confidence: 'medium', dueDate: '',
    }])
  }

  const removeMyCommitment = (index: number) => {
    setMyCommitments(myCommitments.filter((_, i) => i !== index))
  }

  const updateMyCommitment = (index: number, field: string, value: string) => {
    setMyCommitments(myCommitments.map((c, i) =>
      i === index ? { ...c, [field]: value } : c
    ))
  }

  const addContactCommitment = () => {
    setContactCommitments([...contactCommitments, {
      description: '', originalWords: '', resolvedDate: null, resolvedTime: null, confidence: 'medium', dueDate: '',
    }])
  }

  const removeContactCommitment = (index: number) => {
    setContactCommitments(contactCommitments.filter((_, i) => i !== index))
  }

  const updateContactCommitment = (index: number, field: string, value: string) => {
    setContactCommitments(contactCommitments.map((c, i) =>
      i === index ? { ...c, [field]: value } : c
    ))
  }

  const updateCalendarEvent = (index: number, field: string, value: string) => {
    setCalendarEvents(calendarEvents.map((e, i) =>
      i === index ? { ...e, [field]: value } : e
    ))
  }

  const removeCalendarEvent = (index: number) => {
    setCalendarEvents(calendarEvents.filter((_, i) => i !== index))
  }

  // Add event to Google Calendar via API
  const addToGoogleCalendar = async (index: number) => {
    const event = calendarEvents[index]
    if (!event.date) return

    setAddingToCalendar(index)
    try {
      // Build datetime strings (Eastern Time)
      const startDateTime = event.startTime
        ? `${event.date}T${event.startTime}:00-05:00`
        : `${event.date}T09:00:00-05:00`
      const endDateTime = event.endTime
        ? `${event.date}T${event.endTime}:00-05:00`
        : event.startTime
          ? `${event.date}T${String(parseInt(event.startTime.split(':')[0]) + 1).padStart(2, '0')}:${event.startTime.split(':')[1]}:00-05:00`
          : `${event.date}T10:00:00-05:00`

      const res = await fetch('/api/calendar/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          summary: event.title,
          start: startDateTime,
          end: endDateTime,
          location: event.location || undefined,
        }),
      })

      if (res.ok) {
        setCalendarEvents(calendarEvents.map((e, i) =>
          i === index ? { ...e, addedToCalendar: true } : e
        ))
      } else {
        const err = await res.json()
        alert(`Failed to add to calendar: ${err.error || 'Unknown error'}`)
      }
    } catch (error) {
      console.error('Calendar add failed:', error)
      alert('Failed to add to calendar. Check calendar connection.')
    } finally {
      setAddingToCalendar(null)
    }
  }

  // Create contact inline via API (without navigating away)
  const createContactInline = async (index: number) => {
    const nc = extraction.newContactsMentioned[index]
    if (!nc) return

    setCreatingContact(index)
    try {
      const res = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: nc.name,
          organization: nc.org || '',
          notes: `Mentioned in debrief with ${contactName}: ${nc.context}`,
          tier: 3,
          status: 'target',
        }),
      })

      if (res.ok) {
        setCreatedContacts(prev => { const next = new Set(Array.from(prev)); next.add(index); return next })
      } else {
        const errData = await res.json().catch(() => ({ error: res.statusText }))
        console.error('Contact creation failed:', errData)
        alert(`Failed to create contact: ${errData.error || res.statusText}`)
      }
    } catch (error) {
      console.error('Contact creation failed:', error)
      alert(`Failed to create contact: ${error instanceof Error ? error.message : 'Network error'}`)
    } finally {
      setCreatingContact(null)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const finalSummary = containsNonpublic
        ? `[NONPUBLIC] ${summary}`
        : summary

      // Combine relationship notes into summary
      const fullSummary = extraction.relationshipNotes
        ? `${finalSummary}\n\nRelationship notes: ${extraction.relationshipNotes}`
        : finalSummary

      // Combine both commitment types into legacy format for the interaction record
      const allCommitments = [
        ...myCommitments.filter(c => c.description.trim()).map(c => ({
          description: c.description,
          due_date: c.dueDate || c.resolvedDate || '',
          fulfilled: false,
          fulfilled_date: null as string | null,
        })),
        ...contactCommitments.filter(c => c.description.trim()).map(c => ({
          description: `[${contactName}] ${c.description}`,
          due_date: c.dueDate || c.resolvedDate || '',
          fulfilled: false,
          fulfilled_date: null as string | null,
        })),
      ]

      // Auto-add any calendar events that haven't been added yet
      const unadded = calendarEvents.filter(e => !e.addedToCalendar && e.date && e.title)
      if (unadded.length > 0) {
        await Promise.allSettled(
          unadded.map(async (evt) => {
            const startDateTime = evt.startTime
              ? `${evt.date}T${evt.startTime}:00-05:00`
              : `${evt.date}T09:00:00-05:00`
            const endDateTime = evt.endTime
              ? `${evt.date}T${evt.endTime}:00-05:00`
              : evt.startTime
                ? `${evt.date}T${String(parseInt(evt.startTime.split(':')[0]) + 1).padStart(2, '0')}:${evt.startTime.split(':')[1]}:00-05:00`
                : `${evt.date}T10:00:00-05:00`

            return fetch('/api/calendar/events', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                summary: evt.title,
                start: startDateTime,
                end: endDateTime,
                location: evt.location || undefined,
              }),
            })
          })
        )
      }

      const res = await fetch('/api/interactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contactId,
          type: interactionType,
          date: new Date().toISOString().split('T')[0],
          summary: fullSummary,
          commitments: JSON.stringify(allCommitments),
          newContactsMentioned: JSON.stringify(extraction.newContactsMentioned),
          followUpRequired,
          followUpDescription: followUpRequired ? followUpDescription : null,
          source: 'voice_debrief',
        }),
      })

      if (!res.ok) throw new Error('Failed to save')

      setSaved(true)
      setTimeout(() => {
        // Save personal data (fire and forget — don't block navigation)
      const personalSaves: Promise<unknown>[] = []
      if (extraction.personalInterests?.length) {
        extraction.personalInterests.forEach(interest => {
          personalSaves.push(fetch('/api/personal/interests', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contactId, interest, confidence: 'medium', source: 'voice_debrief' }),
          }).catch(() => {}))
        })
      }
      if (extraction.personalActivities?.length) {
        extraction.personalActivities.forEach(activity => {
          personalSaves.push(fetch('/api/personal/activities', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contactId, activity, confidence: 'medium', source: 'voice_debrief', frequency: 'occasional' }),
          }).catch(() => {}))
        })
      }
      if (extraction.lifeEventsMentioned?.length) {
        extraction.lifeEventsMentioned.forEach(le => {
          personalSaves.push(fetch(`/api/contacts/${contactId}/life-events`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ eventType: le.eventType, description: le.description, eventDate: le.date }),
          }).catch(() => {}))
        })
      }
      Promise.all(personalSaves).catch(() => {})

      router.push(`/contacts/${contactId}`)
        router.refresh()
      }, 1500)
    } catch (error) {
      console.error('Save failed:', error)
      alert('Failed to save interaction. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  if (saved) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <CheckCircle className="h-12 w-12 text-green-500 mb-3" />
        <h3 className="text-lg font-semibold text-gray-900">Debrief Saved</h3>
        <p className="text-sm text-gray-500 mt-1">Redirecting to contact page...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-green-200 bg-green-50 p-3">
        <p className="text-sm text-green-700 font-medium">
          Debrief processed for {contactName}. Review and edit before saving.
        </p>
      </div>

      {/* Interaction Type */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Interaction Type</label>
        <select
          value={interactionType}
          onChange={e => setInteractionType(e.target.value)}
          className="w-full rounded-md border px-3 py-2 text-sm"
        >
          <option value="meeting">Meeting</option>
          <option value="call">Call</option>
          <option value="coffee">Coffee</option>
          <option value="conference_encounter">Conference Encounter</option>
          <option value="event_copanel">Event Co-panel</option>
          <option value="other">Other</option>
        </select>
      </div>

      {/* Summary */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Summary</label>
        <textarea
          value={summary}
          onChange={e => setSummary(e.target.value)}
          rows={4}
          className="w-full rounded-md border px-3 py-2 text-sm"
        />
      </div>

      {/* Topics */}
      {extraction.topicsDiscussed.length > 0 && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Topics Discussed</label>
          <div className="flex flex-wrap gap-1.5">
            {extraction.topicsDiscussed.map((topic, i) => (
              <span key={i} className="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-600">
                {topic}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Calendar Events */}
      {calendarEvents.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
              <CalendarPlus className="h-3.5 w-3.5 text-emerald-600" />
              Calendar Events
            </label>
          </div>
          <div className="space-y-3">
            {calendarEvents.map((evt, i) => (
              <div key={i} className={cn(
                'rounded-md border p-3 space-y-2',
                evt.addedToCalendar
                  ? 'border-green-200 bg-green-50/50'
                  : 'border-emerald-100 bg-emerald-50/30'
              )}>
                <div className="flex gap-2 items-start">
                  <input
                    value={evt.title}
                    onChange={e => updateCalendarEvent(i, 'title', e.target.value)}
                    placeholder="Event title"
                    className="flex-1 rounded-md border px-3 py-1.5 text-sm"
                  />
                  <input
                    type="date"
                    value={evt.date || ''}
                    onChange={e => updateCalendarEvent(i, 'date', e.target.value)}
                    className="w-36 rounded-md border px-3 py-1.5 text-sm"
                  />
                  <button
                    onClick={() => removeCalendarEvent(i)}
                    className="text-gray-400 hover:text-red-500 p-1"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex gap-2 items-center">
                  <Clock className="h-3.5 w-3.5 text-gray-400" />
                  <input
                    type="time"
                    value={evt.startTime || ''}
                    onChange={e => updateCalendarEvent(i, 'startTime', e.target.value)}
                    className="w-28 rounded-md border px-2 py-1 text-sm"
                  />
                  <span className="text-xs text-gray-400">to</span>
                  <input
                    type="time"
                    value={evt.endTime || ''}
                    onChange={e => updateCalendarEvent(i, 'endTime', e.target.value)}
                    className="w-28 rounded-md border px-2 py-1 text-sm"
                  />
                  {evt.startTime && (
                    <span className="text-xs text-gray-500">
                      {formatTime12h(evt.startTime)}
                      {evt.endTime ? ` – ${formatTime12h(evt.endTime)}` : ''}
                    </span>
                  )}
                </div>
                {evt.originalWords && (
                  <div className="flex items-start gap-1.5 pl-1">
                    <Quote className="h-3 w-3 text-emerald-300 mt-0.5 shrink-0" />
                    <p className="text-xs text-emerald-500 italic">{evt.originalWords}</p>
                  </div>
                )}
                <div className="flex justify-end">
                  {evt.addedToCalendar ? (
                    <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
                      <CheckCircle className="h-3.5 w-3.5" />
                      Added to Calendar
                    </span>
                  ) : (
                    <button
                      onClick={() => addToGoogleCalendar(i)}
                      disabled={!evt.date || addingToCalendar === i}
                      className="flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {addingToCalendar === i ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <CalendarPlus className="h-3.5 w-3.5" />
                      )}
                      {addingToCalendar === i ? 'Adding...' : 'Add to Calendar'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* My Commitments (Stephen's promises) */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-gray-700">My Commitments</label>
          <button
            onClick={addMyCommitment}
            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
          >
            <Plus className="h-3 w-3" /> Add
          </button>
        </div>
        {myCommitments.length === 0 ? (
          <p className="text-sm text-gray-400 italic">No commitments extracted</p>
        ) : (
          <div className="space-y-3">
            {myCommitments.map((c, i) => (
              <div key={i} className="rounded-md border p-3 bg-white space-y-2">
                <div className="flex gap-2 items-start">
                  <input
                    value={c.description}
                    onChange={e => updateMyCommitment(i, 'description', e.target.value)}
                    placeholder="What I committed to do"
                    className="flex-1 rounded-md border px-3 py-1.5 text-sm"
                  />
                  <input
                    type="date"
                    value={c.dueDate || ''}
                    onChange={e => updateMyCommitment(i, 'dueDate', e.target.value)}
                    className="w-36 rounded-md border px-3 py-1.5 text-sm"
                  />
                  <span className={cn(
                    'rounded px-1.5 py-0.5 text-xs font-medium whitespace-nowrap',
                    CONFIDENCE_BADGE[c.confidence]?.color || CONFIDENCE_BADGE.medium.color
                  )}>
                    {CONFIDENCE_BADGE[c.confidence]?.label || 'Med'}
                  </span>
                  <button
                    onClick={() => removeMyCommitment(i)}
                    className="text-gray-400 hover:text-red-500 p-1"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                {c.originalWords && (
                  <div className="flex items-start gap-1.5 pl-1">
                    <Quote className="h-3 w-3 text-gray-300 mt-0.5 shrink-0" />
                    <p className="text-xs text-gray-400 italic">{c.originalWords}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Contact's Commitments */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
            <ArrowRightLeft className="h-3.5 w-3.5 text-indigo-500" />
            {contactName}&apos;s Commitments
          </label>
          <button
            onClick={addContactCommitment}
            className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700"
          >
            <Plus className="h-3 w-3" /> Add
          </button>
        </div>
        {contactCommitments.length === 0 ? (
          <p className="text-sm text-gray-400 italic">No commitments from {contactName} detected</p>
        ) : (
          <div className="space-y-3">
            {contactCommitments.map((c, i) => (
              <div key={i} className="rounded-md border border-indigo-100 p-3 bg-indigo-50/30 space-y-2">
                <div className="flex gap-2 items-start">
                  <input
                    value={c.description}
                    onChange={e => updateContactCommitment(i, 'description', e.target.value)}
                    placeholder={`What ${contactName} committed to do`}
                    className="flex-1 rounded-md border px-3 py-1.5 text-sm"
                  />
                  <input
                    type="date"
                    value={c.dueDate || ''}
                    onChange={e => updateContactCommitment(i, 'dueDate', e.target.value)}
                    className="w-36 rounded-md border px-3 py-1.5 text-sm"
                  />
                  <span className={cn(
                    'rounded px-1.5 py-0.5 text-xs font-medium whitespace-nowrap',
                    CONFIDENCE_BADGE[c.confidence]?.color || CONFIDENCE_BADGE.medium.color
                  )}>
                    {CONFIDENCE_BADGE[c.confidence]?.label || 'Med'}
                  </span>
                  <button
                    onClick={() => removeContactCommitment(i)}
                    className="text-gray-400 hover:text-red-500 p-1"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                {c.originalWords && (
                  <div className="flex items-start gap-1.5 pl-1">
                    <Quote className="h-3 w-3 text-indigo-300 mt-0.5 shrink-0" />
                    <p className="text-xs text-indigo-400 italic">{c.originalWords}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Follow-ups */}
      <div>
        <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1">
          <input
            type="checkbox"
            checked={followUpRequired}
            onChange={e => setFollowUpRequired(e.target.checked)}
            className="rounded"
          />
          Follow-up Required
        </label>
        {followUpRequired && (
          <textarea
            value={followUpDescription}
            onChange={e => setFollowUpDescription(e.target.value)}
            placeholder="Describe what needs to be followed up on"
            rows={2}
            className="w-full rounded-md border px-3 py-2 text-sm mt-1"
          />
        )}
      </div>

      {/* New contacts mentioned — inline creation, no navigation */}
      {extraction.newContactsMentioned.length > 0 && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">New Contacts Mentioned</label>
          <div className="space-y-2">
            {extraction.newContactsMentioned.map((nc, i) => (
              <div key={i} className="flex items-center justify-between rounded-md border p-3 bg-blue-50/50">
                <div>
                  <p className="text-sm font-medium text-gray-900">{nc.name}</p>
                  {nc.org && <p className="text-xs text-gray-500">{nc.org}</p>}
                  <p className="text-xs text-gray-400 mt-0.5">{nc.context}</p>
                </div>
                {createdContacts.has(i) ? (
                  <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
                    <CheckCircle className="h-3.5 w-3.5" />
                    Created
                  </span>
                ) : (
                  <div className="flex gap-2">
                    <button
                      onClick={() => createContactInline(i)}
                      disabled={creatingContact === i}
                      className="flex items-center gap-1 rounded-md bg-blue-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      {creatingContact === i ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <UserPlus className="h-3.5 w-3.5" />
                      )}
                      {creatingContact === i ? 'Creating...' : 'Quick Create'}
                    </button>
                    <a
                      href={`/contacts/new?name=${encodeURIComponent(nc.name)}${nc.org ? `&org=${encodeURIComponent(nc.org)}` : ''}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
                      title="Open full form in new tab"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Full Form
                    </a>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Personal Data (interests, activities, life events) */}
      {(extraction.personalInterests?.length || extraction.personalActivities?.length || extraction.lifeEventsMentioned?.length) ? (
        <div className="rounded-lg border border-pink-200 bg-pink-50 p-4">
          <h3 className="text-sm font-semibold text-pink-800 mb-3">Personal Data Extracted</h3>

          {extraction.personalInterests && extraction.personalInterests.length > 0 && (
            <div className="mb-3">
              <p className="text-xs text-pink-600 font-medium mb-1">Interests</p>
              <div className="flex flex-wrap gap-1">
                {extraction.personalInterests.map((interest, i) => (
                  <span key={i} className="rounded-full bg-violet-100 px-2 py-0.5 text-xs text-violet-700">{interest}</span>
                ))}
              </div>
            </div>
          )}

          {extraction.personalActivities && extraction.personalActivities.length > 0 && (
            <div className="mb-3">
              <p className="text-xs text-pink-600 font-medium mb-1">Activities</p>
              <div className="flex flex-wrap gap-1">
                {extraction.personalActivities.map((activity, i) => (
                  <span key={i} className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">{activity}</span>
                ))}
              </div>
            </div>
          )}

          {extraction.lifeEventsMentioned && extraction.lifeEventsMentioned.length > 0 && (
            <div>
              <p className="text-xs text-pink-600 font-medium mb-1">Life Events</p>
              <div className="space-y-1">
                {extraction.lifeEventsMentioned.map((le, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className="rounded bg-gray-200 px-1.5 py-0.5 text-gray-600">{le.eventType}</span>
                    <span className="text-gray-700">{le.description}</span>
                    {le.date && <span className="text-gray-400">{le.date}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          <p className="text-[10px] text-pink-400 mt-2">These will be saved to the contact&apos;s personal profile on save.</p>
        </div>
      ) : null}

      {/* Relationship Notes */}
      {extraction.relationshipNotes && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Relationship Notes</label>
          <p className="text-sm text-gray-600 rounded-md border p-3 bg-gray-50">
            {extraction.relationshipNotes}
          </p>
        </div>
      )}

      {/* Nonpublic info checkbox */}
      <label className="flex items-center gap-2 p-3 rounded-lg border border-amber-200 bg-amber-50 cursor-pointer">
        <input
          type="checkbox"
          checked={containsNonpublic}
          onChange={e => setContainsNonpublic(e.target.checked)}
          className="rounded"
        />
        <AlertTriangle className="h-4 w-4 text-amber-600" />
        <span className="text-sm text-amber-800">
          This debrief contains nonpublic government information
        </span>
      </label>

      {/* Raw transcript */}
      <div>
        <button
          onClick={() => setShowTranscript(!showTranscript)}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          {showTranscript ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          Raw Transcript
        </button>
        {showTranscript && (
          <div className="mt-2 rounded-md border p-3 bg-gray-50 max-h-60 overflow-y-auto">
            <p className="text-sm text-gray-600 whitespace-pre-wrap">{transcript}</p>
          </div>
        )}
      </div>

      {/* Save */}
      <div className="flex justify-end gap-3 pt-2 border-t">
        <button
          onClick={() => router.back()}
          className="rounded-md border px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={saving || !summary.trim()}
          className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
          {saving ? 'Saving...' : 'Save Interaction'}
        </button>
      </div>
    </div>
  )
}
