'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Send, Copy, RefreshCw, Pencil, MessageSquare } from 'lucide-react'

interface NudgeContact {
  id: string
  name: string
  ring: string
  hasPhone: boolean
}

interface Nudge {
  id: string
  nudgeType: string
  reasoning: string
  suggestedAction: string
  status: string
  scheduledFor: string
  completedAt: string | null
  contacts: NudgeContact[]
}

interface NudgeData {
  nudges: Nudge[]
  completedToday: number
  streak: number
  totalToday: number
  pendingToday: number
}

const NUDGE_TYPE_CONFIG: Record<string, { icon: string; label: string; color: string }> = {
  overdue_reachout: { icon: '⏰', label: 'Overdue', color: 'bg-red-100 text-red-700' },
  birthday: { icon: '🎂', label: 'Birthday', color: 'bg-pink-100 text-pink-700' },
  life_event: { icon: '📌', label: 'Life Event', color: 'bg-blue-100 text-blue-700' },
  dropped_ball: { icon: '💬', label: 'Unreplied', color: 'bg-orange-100 text-orange-700' },
  fading_momentum: { icon: '📉', label: 'Fading', color: 'bg-yellow-100 text-yellow-700' },
  new_contact_followup: { icon: '🆕', label: 'New Contact', color: 'bg-green-100 text-green-700' },
}

const RING_COLORS: Record<string, string> = {
  close: 'bg-purple-100 text-purple-700',
  regular: 'bg-blue-100 text-blue-700',
  outer: 'bg-gray-100 text-gray-700',
  new: 'bg-green-100 text-green-700',
}

interface DraftState {
  text: string
  voiceSource: string
}

export function NudgesContent({ data }: { data: NudgeData }) {
  const router = useRouter()
  const [loading, setLoading] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [copySuccess, setCopySuccess] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Record<string, DraftState>>({})
  const [draftingId, setDraftingId] = useState<string | null>(null)
  const [sendingId, setSendingId] = useState<string | null>(null)
  const [editingNudgeId, setEditingNudgeId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [writingNudgeId, setWritingNudgeId] = useState<string | null>(null)
  const [writeText, setWriteText] = useState('')

  const handleAction = async (nudgeId: string, action: 'complete' | 'dismiss') => {
    setLoading(nudgeId)
    try {
      await fetch('/api/social/nudges', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, nudgeId }),
      })
      router.refresh()
    } catch (err) {
      console.error('Nudge action error:', err)
    }
    setLoading(null)
  }

  const handleGenerate = async () => {
    setGenerating(true)
    try {
      await fetch('/api/social/nudges', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'generate' }),
      })
      router.refresh()
    } catch (err) {
      console.error('Generate error:', err)
    }
    setGenerating(false)
  }

  const handleDraft = async (nudgeId: string, contactId: string) => {
    setDraftingId(nudgeId)
    try {
      const res = await fetch('/api/social/nudges', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'draft', nudgeId, contactId }),
      })
      if (res.ok) {
        const result = await res.json()
        setDrafts(prev => ({
          ...prev,
          [nudgeId]: { text: result.draftText, voiceSource: result.voiceSource },
        }))
      }
    } catch (err) {
      console.error('Draft error:', err)
    }
    setDraftingId(null)
  }

  const handleSend = async (nudgeId: string, contactId: string, contactName: string) => {
    const draft = drafts[nudgeId]
    if (!draft) return
    if (!confirm(`Send this text to ${contactName} via iMessage?`)) return

    setSendingId(nudgeId)
    try {
      const res = await fetch('/api/social/nudges', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send', nudgeId, contactId, message: draft.text }),
      })
      const result = await res.json()
      if (result.success) {
        // Nudge auto-completes on send, refresh
        router.refresh()
      } else {
        alert(`Send failed: ${result.error || 'Unknown error'}`)
      }
    } catch (err) {
      console.error('Send error:', err)
    }
    setSendingId(null)
  }

  const handleCopy = (text: string, nudgeId: string) => {
    navigator.clipboard.writeText(text)
    setCopySuccess(nudgeId)
    setTimeout(() => setCopySuccess(null), 2000)
  }

  const pendingNudges = data.nudges.filter(n => n.status === 'pending')
  const completedNudges = data.nudges.filter(n => n.status === 'completed')
  const dismissedNudges = data.nudges.filter(n => n.status === 'dismissed')

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Daily Reach-Outs</h1>
          <p className="text-sm text-gray-500 mt-1">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/social" className="rounded-md bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200">
            Dashboard
          </Link>
          {data.totalToday === 0 && (
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {generating ? 'Generating...' : 'Generate Nudges'}
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-lg bg-white p-4 shadow-sm text-center">
          <div className="text-3xl font-bold text-green-600">{data.completedToday}</div>
          <div className="text-xs text-gray-500 mt-1">Completed Today</div>
        </div>
        <div className="rounded-lg bg-white p-4 shadow-sm text-center">
          <div className="text-3xl font-bold text-yellow-600">{data.pendingToday}</div>
          <div className="text-xs text-gray-500 mt-1">Remaining</div>
        </div>
        <div className="rounded-lg bg-white p-4 shadow-sm text-center">
          <div className="text-3xl font-bold text-indigo-600">{data.streak}</div>
          <div className="text-xs text-gray-500 mt-1">Day Streak</div>
        </div>
      </div>

      {/* Pending Nudges */}
      {pendingNudges.length > 0 ? (
        <div className="space-y-3">
          {pendingNudges.map((nudge) => {
            const config = NUDGE_TYPE_CONFIG[nudge.nudgeType] || { icon: '📋', label: nudge.nudgeType, color: 'bg-gray-100 text-gray-700' }
            const draft = drafts[nudge.id]
            const contact = nudge.contacts[0] // primary contact for this nudge

            return (
              <div key={nudge.id} className="rounded-lg bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3 flex-1">
                    <span className="text-2xl mt-0.5">{config.icon}</span>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${config.color}`}>
                          {config.label}
                        </span>
                        {nudge.contacts.map(c => (
                          <Link
                            key={c.id}
                            href={`/contacts/${c.id}`}
                            className="flex items-center gap-1"
                          >
                            <span className="font-semibold text-gray-900 hover:text-blue-600">{c.name}</span>
                            <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${RING_COLORS[c.ring] || RING_COLORS.new}`}>
                              {c.ring}
                            </span>
                          </Link>
                        ))}
                      </div>
                      <p className="text-sm text-gray-600 mb-1">{nudge.reasoning}</p>
                      <p className="text-sm font-medium text-gray-800">{nudge.suggestedAction}</p>

                      {/* Write from scratch */}
                      {writingNudgeId === nudge.id && !draft && (
                        <div className="mt-3 rounded-lg bg-blue-50 border border-blue-100 p-3">
                          <textarea
                            value={writeText}
                            onChange={e => setWriteText(e.target.value)}
                            rows={3}
                            autoFocus
                            placeholder={contact ? `Write a text to ${contact.name}...` : 'Write a text...'}
                            className="w-full rounded border border-blue-200 bg-white p-2 text-sm text-gray-800 focus:border-blue-400 focus:outline-none resize-y"
                          />
                          <div className="flex gap-1.5 mt-1.5">
                            <button
                              onClick={() => {
                                setDrafts(prev => ({ ...prev, [nudge.id]: { text: writeText, voiceSource: 'manual' } }))
                                setWritingNudgeId(null)
                                setWriteText('')
                              }}
                              className="rounded bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700"
                            >
                              Save Draft
                            </button>
                            <button
                              onClick={() => { setWritingNudgeId(null); setWriteText('') }}
                              className="rounded border border-gray-200 bg-white px-2.5 py-1 text-xs text-gray-500 hover:bg-gray-50"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Draft Text */}
                      {draft && (
                        <div className="mt-3 rounded-lg bg-green-50 border border-green-100 p-3">
                          {editingNudgeId === nudge.id ? (
                            <div>
                              <textarea
                                value={editText}
                                onChange={e => setEditText(e.target.value)}
                                rows={4}
                                autoFocus
                                className="w-full rounded border border-green-200 bg-white p-2 text-sm text-gray-800 focus:border-blue-400 focus:outline-none resize-y"
                              />
                              <div className="flex gap-1.5 mt-1.5">
                                <button
                                  onClick={() => {
                                    const originalText = drafts[nudge.id]?.text || ''
                                    setDrafts(prev => ({ ...prev, [nudge.id]: { ...prev[nudge.id], text: editText } }))
                                    setEditingNudgeId(null)
                                    setEditText('')
                                    // Save correction for learning if text changed
                                    if (originalText && originalText !== editText && contact) {
                                      fetch('/api/social/nudges', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({
                                          action: 'save_correction',
                                          contactId: contact.id,
                                          nudgeId: nudge.id,
                                          originalDraft: originalText,
                                          editedDraft: editText,
                                          voiceSource: drafts[nudge.id]?.voiceSource || '',
                                        }),
                                      }).catch(() => {})
                                    }
                                  }}
                                  className="rounded bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700"
                                >
                                  Save
                                </button>
                                <button
                                  onClick={() => { setEditingNudgeId(null); setEditText('') }}
                                  className="rounded border border-gray-200 bg-white px-2.5 py-1 text-xs text-gray-500 hover:bg-gray-50"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <p className="text-sm text-gray-800 whitespace-pre-wrap">{draft.text}</p>
                              <div className="flex items-center justify-between mt-2">
                                <span className="text-[10px] text-green-600">
                                  {draft.voiceSource === 'per_contact' ? '🎯 personal voice' : draft.voiceSource === 'fallback' ? '📝 fallback' : `📋 ${draft.voiceSource}`}
                                </span>
                                <div className="flex gap-1.5">
                                  <button
                                    onClick={() => { setEditingNudgeId(nudge.id); setEditText(draft.text) }}
                                    className="rounded px-2 py-1 text-xs text-gray-500 hover:bg-blue-50 transition-colors"
                                    title="Edit text"
                                  >
                                    <Pencil className="h-3 w-3 inline mr-1" />
                                    Edit
                                  </button>
                                  <button
                                    onClick={() => handleCopy(draft.text, nudge.id)}
                                    className="rounded px-2 py-1 text-xs text-gray-500 hover:bg-green-100 transition-colors"
                                  >
                                    <Copy className="h-3 w-3 inline mr-1" />
                                    {copySuccess === nudge.id ? 'Copied!' : 'Copy'}
                                  </button>
                                  {contact?.hasPhone && (
                                    <button
                                      onClick={() => handleSend(nudge.id, contact.id, contact.name)}
                                      disabled={sendingId === nudge.id}
                                      className="rounded bg-green-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
                                    >
                                      <Send className={`h-3 w-3 inline mr-1 ${sendingId === nudge.id ? 'animate-pulse' : ''}`} />
                                      {sendingId === nudge.id ? 'Sending...' : `Send to ${contact.name}`}
                                    </button>
                                  )}
                                  {contact && !contact.hasPhone && (
                                    <span className="text-[10px] text-gray-400 self-center">No phone number</span>
                                  )}
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-2 mt-4 ml-9">
                  {!draft && contact && (
                    <>
                      <button
                        onClick={() => handleDraft(nudge.id, contact.id)}
                        disabled={draftingId === nudge.id}
                        className="flex items-center gap-1 rounded-md bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                      >
                        <RefreshCw className={`h-3.5 w-3.5 ${draftingId === nudge.id ? 'animate-spin' : ''}`} />
                        {draftingId === nudge.id ? 'Drafting...' : 'AI Draft'}
                      </button>
                      {writingNudgeId !== nudge.id && (
                        <button
                          onClick={() => { setWritingNudgeId(nudge.id); setWriteText('') }}
                          className="flex items-center gap-1 rounded-md border border-gray-200 bg-white px-4 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
                        >
                          <MessageSquare className="h-3.5 w-3.5" />
                          Write Text
                        </button>
                      )}
                    </>
                  )}
                  {draft && (
                    <button
                      onClick={() => handleDraft(nudge.id, contact.id)}
                      disabled={draftingId === nudge.id}
                      className="flex items-center gap-1 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${draftingId === nudge.id ? 'animate-spin' : ''}`} />
                      Redraft
                    </button>
                  )}
                  <button
                    onClick={() => handleAction(nudge.id, 'complete')}
                    disabled={loading === nudge.id}
                    className="rounded-md bg-green-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                  >
                    {loading === nudge.id ? '...' : 'Mark Done'}
                  </button>
                  <button
                    onClick={() => handleAction(nudge.id, 'dismiss')}
                    disabled={loading === nudge.id}
                    className="rounded-md border border-gray-200 bg-white px-4 py-1.5 text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      ) : data.totalToday === 0 ? (
        <div className="rounded-lg bg-white p-8 shadow-sm text-center">
          <p className="text-lg text-gray-500 mb-2">No nudges for today yet</p>
          <p className="text-sm text-gray-400">Click &quot;Generate Nudges&quot; to get today&apos;s reach-out suggestions</p>
        </div>
      ) : (
        <div className="rounded-lg bg-green-50 p-8 text-center border border-green-200">
          <span className="text-4xl">🎉</span>
          <p className="text-lg font-medium text-green-800 mt-2">All done for today!</p>
          <p className="text-sm text-green-600">You handled all {data.totalToday} nudges</p>
        </div>
      )}

      {/* Completed Today */}
      {completedNudges.length > 0 && (
        <div className="rounded-lg bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Completed Today</h2>
          <div className="space-y-2">
            {completedNudges.map(nudge => {
              const config = NUDGE_TYPE_CONFIG[nudge.nudgeType] || { icon: '📋', label: nudge.nudgeType, color: 'bg-gray-100 text-gray-700' }
              return (
                <div key={nudge.id} className="flex items-center gap-3 p-2 rounded bg-green-50/50 text-sm">
                  <span className="text-green-500">✓</span>
                  <span>{config.icon}</span>
                  <span className="text-gray-600">{nudge.contacts.map(c => c.name).join(', ')}</span>
                  <span className="text-gray-400">&mdash;</span>
                  <span className="text-gray-500 line-through">{nudge.suggestedAction}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Dismissed */}
      {dismissedNudges.length > 0 && (
        <div className="rounded-lg bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-500 mb-3">Dismissed</h2>
          <div className="space-y-1">
            {dismissedNudges.map(nudge => (
              <div key={nudge.id} className="flex items-center gap-2 p-1.5 text-sm text-gray-400">
                <span>&times;</span>
                <span>{nudge.contacts.map(c => c.name).join(', ')}: {nudge.suggestedAction}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
