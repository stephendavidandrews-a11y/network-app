'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  CheckCircle,
  Clock,
  Loader2,
  ChevronDown,
  Send,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface CommitmentActionsProps {
  commitmentId: string
  contactName: string
  description: string
  compact?: boolean
}

export function CommitmentActions({
  commitmentId,
  contactName,
  description,
  compact = false,
}: CommitmentActionsProps) {
  const router = useRouter()
  const [showFulfillForm, setShowFulfillForm] = useState(false)
  const [showSnoozeMenu, setShowSnoozeMenu] = useState(false)
  const [notes, setNotes] = useState('')
  const [queueOutreach, setQueueOutreach] = useState(true)
  const [saving, setSaving] = useState(false)
  const [snoozing, setSnoozing] = useState(false)

  const handleFulfill = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/commitments/${commitmentId}/fulfill`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fulfilledNotes: notes.trim() || null,
          queueOutreach,
        }),
      })
      if (!res.ok) throw new Error('Failed to fulfill')
      setShowFulfillForm(false)
      router.refresh()
    } catch (err) {
      console.error('Fulfill failed:', err)
      alert('Failed to mark as done. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const handleSnooze = async (days: number) => {
    setSnoozing(true)
    try {
      const res = await fetch(`/api/commitments/${commitmentId}/snooze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days }),
      })
      if (!res.ok) throw new Error('Failed to snooze')
      setShowSnoozeMenu(false)
      router.refresh()
    } catch (err) {
      console.error('Snooze failed:', err)
      alert('Failed to snooze. Please try again.')
    } finally {
      setSnoozing(false)
    }
  }

  return (
    <div className="space-y-2">
      {/* Action buttons */}
      <div className="flex gap-1.5">
        <button
          onClick={() => { setShowFulfillForm(!showFulfillForm); setShowSnoozeMenu(false) }}
          className={cn(
            'flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition-colors',
            showFulfillForm
              ? 'border-green-300 bg-green-50 text-green-700'
              : 'border-gray-200 text-gray-600 hover:bg-green-50 hover:text-green-700 hover:border-green-300'
          )}
        >
          <CheckCircle className="h-3 w-3" />
          {compact ? 'Done' : 'Mark Done'}
        </button>

        <div className="relative">
          <button
            onClick={() => { setShowSnoozeMenu(!showSnoozeMenu); setShowFulfillForm(false) }}
            disabled={snoozing}
            className="flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-amber-50 hover:text-amber-700 hover:border-amber-300 transition-colors"
          >
            {snoozing ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Clock className="h-3 w-3" />
            )}
            Snooze
            <ChevronDown className="h-3 w-3" />
          </button>

          {showSnoozeMenu && (
            <div className="absolute right-0 top-full mt-1 z-10 rounded-md border bg-white shadow-lg py-1 min-w-[120px]">
              <button
                onClick={() => handleSnooze(1)}
                className="block w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
              >
                1 day
              </button>
              <button
                onClick={() => handleSnooze(3)}
                className="block w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
              >
                3 days
              </button>
              <button
                onClick={() => handleSnooze(7)}
                className="block w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
              >
                1 week
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Fulfill form (expandable) */}
      {showFulfillForm && (
        <div className="rounded-md border border-green-200 bg-green-50/50 p-3 space-y-2">
          <p className="text-xs text-gray-500 truncate">
            Completing: <span className="font-medium text-gray-700">{description}</span>
          </p>

          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Fulfillment notes (optional)"
            rows={2}
            className="w-full rounded-md border border-gray-200 px-2.5 py-1.5 text-xs focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
          />

          <label className="flex items-center gap-2 text-xs text-gray-600">
            <input
              type="checkbox"
              checked={queueOutreach}
              onChange={e => setQueueOutreach(e.target.checked)}
              className="rounded"
            />
            <Send className="h-3 w-3" />
            Queue follow-up outreach to {contactName}
          </label>

          <div className="flex gap-2 pt-1">
            <button
              onClick={handleFulfill}
              disabled={saving}
              className="flex items-center gap-1 rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle className="h-3 w-3" />}
              {saving ? 'Saving...' : 'Complete'}
            </button>
            <button
              onClick={() => setShowFulfillForm(false)}
              className="rounded-md border px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
