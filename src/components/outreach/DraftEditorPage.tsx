'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  RefreshCw,
  Send,
  Save,
  CheckCircle,
  Clock,
  Sparkles,
  User,
  MessageSquare,
  Zap,
  Mail,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { TIER_COLORS } from '@/lib/constants'
import { formatDate, formatRelativeDate } from '@/lib/utils'

interface OutreachData {
  id: string
  contactId: string
  triggerType: string
  triggerDescription: string
  draftSubject: string | null
  draftBody: string | null
  draftFormat: string
  status: string
  priority: number
}

interface ContactData {
  id: string
  name: string
  title: string | null
  organization: string | null
  email: string | null
  tier: number
  whyTheyMatter: string | null
  connectionToHawleyOrbit: string | null
  notes: string | null
  categories: string[]
  tags: string[]
  lastInteractionDate: string | null
  status: string
}

interface InteractionData {
  id: string
  type: string
  date: string
  summary: string | null
}

interface SignalData {
  id: string
  signalType: string
  title: string
  description: string | null
  detectedAt: string
  outreachHook: string | null
}

interface PrevOutreachData {
  id: string
  draftSubject: string | null
  sentAt: string | null
}

interface Props {
  outreach: OutreachData
  contact: ContactData
  interactions: InteractionData[]
  signals: SignalData[]
  previousOutreach: PrevOutreachData[]
}

export function DraftEditorPage({ outreach, contact, interactions, signals, previousOutreach }: Props) {
  const router = useRouter()
  const [subject, setSubject] = useState(outreach.draftSubject || '')
  const [body, setBody] = useState(outreach.draftBody || '')
  const [format, setFormat] = useState(outreach.draftFormat || 'email')
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState(outreach.status)

  const generateDraft = async () => {
    setGenerating(true)
    setError('')
    try {
      const res = await fetch('/api/ai/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contactId: contact.id,
          triggerType: outreach.triggerType,
          triggerDescription: outreach.triggerDescription,
          format,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        setSubject(data.subject || '')
        setBody(data.body || '')
      } else {
        setError(data.error || 'Failed to generate draft')
      }
    } catch {
      setError('Network error generating draft')
    } finally {
      setGenerating(false)
    }
  }

  const saveDraft = async () => {
    setSaving(true)
    try {
      await fetch(`/api/outreach/${outreach.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draftSubject: subject, draftBody: body }),
      })
    } finally {
      setSaving(false)
    }
  }

  const approveDraft = async () => {
    await saveDraft()
    await fetch(`/api/outreach/${outreach.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'approved',
        finalText: body,
        draftSubject: subject,
        draftBody: body,
      }),
    })
    setStatus('approved')
  }

  const sendEmail = async () => {
    if (!contact.email) {
      setError('Contact has no email address')
      return
    }
    setSending(true)
    setError('')
    try {
      // Approve first if not already approved
      if (status !== 'approved') {
        await approveDraft()
      }
      const res = await fetch(`/api/outreach/${outreach.id}/send`, { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        setStatus('sent')
        router.push('/outreach')
      } else {
        setError(data.error || 'Failed to send email')
      }
    } catch {
      setError('Network error sending email')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link href="/outreach" className="rounded-md p-1.5 hover:bg-gray-100">
            <ArrowLeft className="h-5 w-5 text-gray-500" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Draft Outreach</h1>
            <p className="text-sm text-gray-500">
              To: {contact.name}{contact.organization ? ` at ${contact.organization}` : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {status === 'sent' ? (
            <span className="flex items-center gap-1.5 text-green-600 text-sm font-medium">
              <CheckCircle className="h-4 w-4" /> Sent
            </span>
          ) : (
            <>
              <button onClick={saveDraft} disabled={saving}
                className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                <Save className="h-4 w-4" /> {saving ? 'Saving...' : 'Save'}
              </button>
              <button onClick={approveDraft}
                className="flex items-center gap-1.5 rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700">
                <CheckCircle className="h-4 w-4" /> Approve
              </button>
              {contact.email && (
                <button onClick={sendEmail} disabled={sending}
                  className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                  <Send className="h-4 w-4" /> {sending ? 'Sending...' : 'Send'}
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>
      )}

      <div className="grid grid-cols-5 gap-6">
        {/* Left: Editor (3/5) */}
        <div className="col-span-3 space-y-4">
          {/* Format + Generate */}
          <div className="flex items-center gap-3">
            <select value={format} onChange={(e) => setFormat(e.target.value)}
              className="rounded-md border px-3 py-1.5 text-sm">
              <option value="email">Email</option>
              <option value="linkedin">LinkedIn</option>
              <option value="text">Text Message</option>
            </select>
            <button onClick={generateDraft} disabled={generating}
              className="flex items-center gap-1.5 rounded-md bg-purple-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50">
              {generating ? (
                <><RefreshCw className="h-4 w-4 animate-spin" /> Generating...</>
              ) : (
                <><Sparkles className="h-4 w-4" /> {body ? 'Regenerate' : 'Generate'} with Claude</>
              )}
            </button>
          </div>

          {/* Trigger context */}
          <div className="rounded-md bg-amber-50 border border-amber-200 p-3">
            <p className="text-xs font-medium text-amber-700 uppercase tracking-wide">Trigger</p>
            <p className="text-sm text-amber-800 mt-0.5">
              {outreach.triggerType.replace(/_/g, ' ')} — {outreach.triggerDescription}
            </p>
          </div>

          {/* Subject */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Email subject line..."
              className="w-full rounded-md border px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Body */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Body</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Draft your outreach message..."
              rows={16}
              className="w-full rounded-md border px-3 py-2 text-sm font-mono leading-relaxed focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Right: Context panel (2/5) */}
        <div className="col-span-2 space-y-4">
          {/* Contact card */}
          <div className="rounded-lg border bg-white p-4">
            <div className="flex items-center gap-2 mb-3">
              <User className="h-4 w-4 text-gray-400" />
              <h3 className="text-sm font-semibold text-gray-900">Contact</h3>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className={cn('inline-flex h-5 items-center rounded border px-1.5 text-xs font-medium', TIER_COLORS[contact.tier])}>
                  T{contact.tier}
                </span>
                <Link href={`/contacts/${contact.id}`} className="text-sm font-medium text-blue-600 hover:underline">
                  {contact.name}
                </Link>
              </div>
              {contact.title && <p className="text-xs text-gray-500">{contact.title}</p>}
              {contact.organization && <p className="text-xs text-gray-500">{contact.organization}</p>}
              {contact.email && (
                <p className="flex items-center gap-1 text-xs text-gray-500">
                  <Mail className="h-3 w-3" /> {contact.email}
                </p>
              )}
              {contact.lastInteractionDate && (
                <p className="text-xs text-gray-400">
                  Last interaction: {formatRelativeDate(contact.lastInteractionDate)}
                </p>
              )}
            </div>
            {contact.whyTheyMatter && (
              <div className="mt-3 pt-3 border-t">
                <p className="text-xs font-medium text-gray-500 uppercase">Why they matter</p>
                <p className="text-xs text-gray-700 mt-0.5">{contact.whyTheyMatter}</p>
              </div>
            )}
            {contact.connectionToHawleyOrbit && (
              <div className="mt-2">
                <p className="text-xs font-medium text-gray-500 uppercase">Hawley orbit</p>
                <p className="text-xs text-gray-700 mt-0.5">{contact.connectionToHawleyOrbit}</p>
              </div>
            )}
          </div>

          {/* Recent interactions */}
          <div className="rounded-lg border bg-white p-4">
            <div className="flex items-center gap-2 mb-3">
              <MessageSquare className="h-4 w-4 text-gray-400" />
              <h3 className="text-sm font-semibold text-gray-900">Recent Interactions</h3>
            </div>
            {interactions.length === 0 ? (
              <p className="text-xs text-gray-400">No interactions recorded</p>
            ) : (
              <div className="space-y-2">
                {interactions.map(i => (
                  <div key={i.id} className="text-xs">
                    <div className="flex items-center gap-1.5">
                      <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
                        {i.type.replace(/_/g, ' ')}
                      </span>
                      <span className="text-gray-400">{formatDate(i.date)}</span>
                    </div>
                    {i.summary && <p className="text-gray-600 mt-0.5 line-clamp-2">{i.summary}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Intelligence signals */}
          <div className="rounded-lg border bg-white p-4">
            <div className="flex items-center gap-2 mb-3">
              <Zap className="h-4 w-4 text-gray-400" />
              <h3 className="text-sm font-semibold text-gray-900">Intelligence Signals</h3>
            </div>
            {signals.length === 0 ? (
              <p className="text-xs text-gray-400">No recent signals</p>
            ) : (
              <div className="space-y-2">
                {signals.map(s => (
                  <div key={s.id} className="text-xs">
                    <div className="flex items-center gap-1.5">
                      <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-600">
                        {s.signalType.replace(/_/g, ' ')}
                      </span>
                      <span className="text-gray-400">{formatDate(s.detectedAt)}</span>
                    </div>
                    <p className="font-medium text-gray-700 mt-0.5">{s.title}</p>
                    {s.outreachHook && (
                      <p className="text-purple-600 mt-0.5 italic">&ldquo;{s.outreachHook}&rdquo;</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Previous outreach */}
          <div className="rounded-lg border bg-white p-4">
            <div className="flex items-center gap-2 mb-3">
              <Clock className="h-4 w-4 text-gray-400" />
              <h3 className="text-sm font-semibold text-gray-900">Previous Outreach</h3>
            </div>
            {previousOutreach.length === 0 ? (
              <p className="text-xs text-gray-400">No previous outreach sent</p>
            ) : (
              <div className="space-y-2">
                {previousOutreach.map(o => (
                  <div key={o.id} className="text-xs">
                    <p className="text-gray-700">{o.draftSubject || 'No subject'}</p>
                    <p className="text-gray-400">{formatDate(o.sentAt)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
