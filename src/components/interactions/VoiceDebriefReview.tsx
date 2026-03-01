'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Loader2,
  Plus,
  Trash2,
  UserPlus,
  AlertTriangle,
} from 'lucide-react'
import type { DebriefExtraction } from '@/types'

interface VoiceDebriefReviewProps {
  contactId: string
  contactName: string
  extraction: DebriefExtraction
  transcript: string
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
  const [commitments, setCommitments] = useState(
    extraction.commitments.map(c => ({
      description: c.description,
      due_date: c.dueDate || '',
      fulfilled: false,
      fulfilled_date: null as string | null,
    }))
  )
  const [followUpRequired, setFollowUpRequired] = useState(extraction.followUps.length > 0)
  const [followUpDescription, setFollowUpDescription] = useState(
    extraction.followUps.map(f => f.description).join('; ')
  )
  const [interactionType, setInteractionType] = useState<string>('meeting')

  const addCommitment = () => {
    setCommitments([...commitments, { description: '', due_date: '', fulfilled: false, fulfilled_date: null }])
  }

  const removeCommitment = (index: number) => {
    setCommitments(commitments.filter((_, i) => i !== index))
  }

  const updateCommitment = (index: number, field: string, value: string) => {
    setCommitments(commitments.map((c, i) =>
      i === index ? { ...c, [field]: value } : c
    ))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const finalSummary = containsNonpublic
        ? `[NONPUBLIC] ${summary}`
        : summary

      // Add relationship notes to summary if present
      const fullSummary = extraction.relationshipNotes
        ? `${finalSummary}\n\nRelationship notes: ${extraction.relationshipNotes}`
        : finalSummary

      const res = await fetch('/api/interactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contactId,
          type: interactionType,
          date: new Date().toISOString().split('T')[0],
          summary: fullSummary,
          commitments: JSON.stringify(commitments.filter(c => c.description.trim())),
          newContactsMentioned: JSON.stringify(extraction.newContactsMentioned),
          followUpRequired,
          followUpDescription: followUpRequired ? followUpDescription : null,
          source: 'voice_debrief',
        }),
      })

      if (!res.ok) throw new Error('Failed to save')

      setSaved(true)
      setTimeout(() => {
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

      {/* Commitments */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-gray-700">Commitments</label>
          <button
            onClick={addCommitment}
            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
          >
            <Plus className="h-3 w-3" /> Add
          </button>
        </div>
        {commitments.length === 0 ? (
          <p className="text-sm text-gray-400">No commitments extracted</p>
        ) : (
          <div className="space-y-2">
            {commitments.map((c, i) => (
              <div key={i} className="flex gap-2 items-start">
                <input
                  value={c.description}
                  onChange={e => updateCommitment(i, 'description', e.target.value)}
                  placeholder="Commitment description"
                  className="flex-1 rounded-md border px-3 py-1.5 text-sm"
                />
                <input
                  type="date"
                  value={c.due_date}
                  onChange={e => updateCommitment(i, 'due_date', e.target.value)}
                  className="w-36 rounded-md border px-3 py-1.5 text-sm"
                />
                <button
                  onClick={() => removeCommitment(i)}
                  className="text-gray-400 hover:text-red-500 p-1"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
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

      {/* New contacts mentioned */}
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
                <Link
                  href={`/contacts/new?name=${encodeURIComponent(nc.name)}${nc.org ? `&org=${encodeURIComponent(nc.org)}` : ''}`}
                  className="flex items-center gap-1 rounded-md bg-blue-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  Create
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

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
