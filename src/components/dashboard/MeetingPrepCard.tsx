'use client'

import { useState } from 'react'
import Link from 'next/link'
import { FileText, RefreshCw, Mic, ChevronDown, ChevronUp, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TIER_COLORS } from '@/lib/constants'

interface MeetingPrepCardProps {
  meeting: {
    id: string
    summary: string
    start: string
    end: string
    location: string | null
    matchedContactId: string | null
    matchedContactName: string | null
    matchedContactTier: number | null
    linkedEventId: string | null
    linkedEventName: string | null
  }
  existingPrep: {
    id: string
    briefContent: string
    generatedAt: string
  } | null
}

export function MeetingPrepCard({ meeting, existingPrep }: MeetingPrepCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [briefContent, setBriefContent] = useState(existingPrep?.briefContent || '')
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [generatedAt, setGeneratedAt] = useState(existingPrep?.generatedAt || '')
  const hasBrief = !!briefContent

  async function fetchOrGeneratePrep() {
    if (!meeting.matchedContactId) return

    setLoading(true)
    try {
      // First check for cached
      const res = await fetch(`/api/meetings/prep?contactId=${meeting.matchedContactId}&date=${new Date().toISOString().split('T')[0]}`)
      const data = await res.json()

      if (data.exists) {
        setBriefContent(data.prep.briefContent)
        setGeneratedAt(data.prep.generatedAt)
        setExpanded(true)
      } else {
        // Generate new
        await generatePrep()
      }
    } catch (error) {
      console.error('Failed to fetch prep:', error)
    } finally {
      setLoading(false)
    }
  }

  async function generatePrep() {
    if (!meeting.matchedContactId) return

    setGenerating(true)
    try {
      const res = await fetch('/api/meetings/prep', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contactId: meeting.matchedContactId,
          calendarEventId: meeting.id,
          meetingTitle: meeting.summary,
          meetingTime: meeting.start,
        }),
      })
      const data = await res.json()

      if (data.prep) {
        setBriefContent(data.prep.briefContent)
        setGeneratedAt(data.prep.generatedAt)
        setExpanded(true)
      }
    } catch (error) {
      console.error('Failed to generate prep:', error)
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="rounded-lg border bg-white">
      <div className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-400">
                {formatMeetingTime(meeting.start)} – {formatMeetingTime(meeting.end)}
              </span>
              <span className="font-medium text-gray-900">{meeting.summary}</span>
            </div>
            {meeting.matchedContactName && (
              <div className="flex items-center gap-2 mt-1">
                <span className={cn('inline-flex h-5 items-center rounded border px-1.5 text-xs font-medium', TIER_COLORS[meeting.matchedContactTier || 3])}>
                  T{meeting.matchedContactTier}
                </span>
                <Link href={`/contacts/${meeting.matchedContactId}`} className="text-sm text-blue-600 hover:text-blue-700">
                  {meeting.matchedContactName}
                </Link>
              </div>
            )}
            {meeting.linkedEventName && (
              <p className="mt-1 text-xs text-indigo-600">
                Also at tracked event:{' '}
                <Link href={`/events/${meeting.linkedEventId}`} className="underline hover:text-indigo-700">
                  {meeting.linkedEventName}
                </Link>
              </p>
            )}
            {meeting.location && (
              <p className="mt-0.5 text-xs text-gray-400">{meeting.location}</p>
            )}
          </div>

          {/* Action buttons for matched contacts */}
          {meeting.matchedContactId && (
            <div className="flex gap-2 ml-4">
              {hasBrief ? (
                <button
                  onClick={() => setExpanded(!expanded)}
                  className="flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-50"
                >
                  <FileText className="h-3.5 w-3.5" />
                  Prep
                  {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                </button>
              ) : (
                <button
                  onClick={fetchOrGeneratePrep}
                  disabled={loading || generating}
                  className="flex items-center gap-1 rounded-md bg-indigo-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {loading || generating ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <FileText className="h-3.5 w-3.5" />
                  )}
                  {generating ? 'Generating...' : 'View Prep'}
                </button>
              )}
              <Link
                href={`/interactions/new?contact=${meeting.matchedContactId}&mode=voice`}
                className="flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                <Mic className="h-3.5 w-3.5" />
                Debrief
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Expandable prep brief */}
      {expanded && briefContent && (
        <div className="border-t px-4 py-3 bg-indigo-50/30">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-indigo-600">
              Meeting Prep Brief
              {generatedAt && (
                <span className="text-gray-400 font-normal ml-2">
                  Generated {new Date(generatedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                </span>
              )}
            </p>
            <button
              onClick={generatePrep}
              disabled={generating}
              className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 disabled:opacity-50"
            >
              <RefreshCw className={cn('h-3 w-3', generating && 'animate-spin')} />
              Regenerate
            </button>
          </div>
          <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans leading-relaxed">
            {briefContent}
          </pre>
        </div>
      )}
    </div>
  )
}

function formatMeetingTime(isoString: string): string {
  return new Date(isoString).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}
