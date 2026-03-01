'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { ArrowLeft, Mic, Plus, Save, X, Edit } from 'lucide-react'
import { INTERACTION_TYPES } from '@/lib/constants'
import { cn } from '@/lib/utils'
import { VoiceDebrief } from './VoiceDebrief'
import { VoiceDebriefReview } from './VoiceDebriefReview'
import type { DebriefExtraction } from '@/types'

interface Props {
  contacts: Array<{ id: string; name: string; organization: string | null }>
  preselectedContactId?: string
  initialMode?: string
}

type Tab = 'manual' | 'voice'

export function InteractionFormPage({ contacts, preselectedContactId, initialMode }: Props) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<Tab>(initialMode === 'voice' ? 'voice' : 'manual')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Voice debrief state
  const [voiceContactId, setVoiceContactId] = useState(preselectedContactId || '')
  const [extraction, setExtraction] = useState<DebriefExtraction | null>(null)
  const [transcript, setTranscript] = useState('')

  const [form, setForm] = useState({
    contactId: preselectedContactId || '',
    type: 'meeting' as string,
    date: new Date().toISOString().split('T')[0],
    summary: '',
    commitments: [] as Array<{ description: string; due_date: string }>,
    followUpRequired: false,
    followUpDescription: '',
  })

  const [commitmentInput, setCommitmentInput] = useState({ description: '', due_date: '' })

  const addCommitment = () => {
    if (!commitmentInput.description.trim()) return
    setForm(prev => ({
      ...prev,
      commitments: [...prev.commitments, {
        description: commitmentInput.description.trim(),
        due_date: commitmentInput.due_date || '',
      }],
    }))
    setCommitmentInput({ description: '', due_date: '' })
  }

  const removeCommitment = (index: number) => {
    setForm(prev => ({
      ...prev,
      commitments: prev.commitments.filter((_, i) => i !== index),
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.contactId) { setError('Select a contact'); return }
    setSaving(true)
    setError('')

    try {
      const res = await fetch('/api/interactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          commitments: form.commitments.map(c => ({
            ...c,
            due_date: c.due_date || null,
            fulfilled: false,
            fulfilled_date: null,
          })),
          followUpDescription: form.followUpRequired ? form.followUpDescription : null,
        }),
      })

      if (!res.ok) throw new Error('Failed to save')

      router.push(`/contacts/${form.contactId}`)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
      setSaving(false)
    }
  }

  const selectedVoiceContact = contacts.find(c => c.id === voiceContactId)

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="text-gray-400 hover:text-gray-600">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-2xl font-bold text-gray-900">Log Interaction</h1>
      </div>

      {/* Tab switcher */}
      <div className="flex border-b mb-6">
        <button
          onClick={() => setActiveTab('manual')}
          className={cn(
            'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
            activeTab === 'manual'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          )}
        >
          <Edit className="h-4 w-4" />
          Manual Entry
        </button>
        <button
          onClick={() => setActiveTab('voice')}
          className={cn(
            'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
            activeTab === 'voice'
              ? 'border-violet-600 text-violet-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          )}
        >
          <Mic className="h-4 w-4" />
          Voice Debrief
        </button>
      </div>

      {/* Manual Entry Tab */}
      {activeTab === 'manual' && (
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="rounded-lg border bg-white p-6 space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Contact *</label>
              <select value={form.contactId} onChange={e => setForm(prev => ({ ...prev, contactId: e.target.value }))}
                className="w-full rounded-md border px-3 py-2 text-sm">
                <option value="">Select contact...</option>
                {contacts.map(c => (
                  <option key={c.id} value={c.id}>{c.name}{c.organization ? ` — ${c.organization}` : ''}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Type</label>
                <select value={form.type} onChange={e => setForm(prev => ({ ...prev, type: e.target.value }))}
                  className="w-full rounded-md border px-3 py-2 text-sm">
                  {INTERACTION_TYPES.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Date</label>
                <input type="date" value={form.date} onChange={e => setForm(prev => ({ ...prev, date: e.target.value }))}
                  className="w-full rounded-md border px-3 py-2 text-sm" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Summary</label>
              <textarea value={form.summary} onChange={e => setForm(prev => ({ ...prev, summary: e.target.value }))}
                rows={4} placeholder="What was discussed?"
                className="w-full rounded-md border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
            </div>
          </div>

          {/* Commitments */}
          <div className="rounded-lg border bg-white p-6 space-y-4">
            <h2 className="text-sm font-semibold text-gray-900">Commitments</h2>
            {form.commitments.length > 0 && (
              <div className="space-y-2">
                {form.commitments.map((c, i) => (
                  <div key={i} className="flex items-center justify-between bg-gray-50 rounded p-2">
                    <div>
                      <p className="text-sm text-gray-700">{c.description}</p>
                      {c.due_date && <p className="text-xs text-gray-400">Due: {c.due_date}</p>}
                    </div>
                    <button type="button" onClick={() => removeCommitment(i)} className="text-gray-400 hover:text-red-500">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input type="text" value={commitmentInput.description}
                onChange={e => setCommitmentInput(prev => ({ ...prev, description: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addCommitment())}
                placeholder="Commitment description..." className="flex-1 rounded-md border px-3 py-1.5 text-sm" />
              <input type="date" value={commitmentInput.due_date}
                onChange={e => setCommitmentInput(prev => ({ ...prev, due_date: e.target.value }))}
                className="rounded-md border px-3 py-1.5 text-sm" />
              <button type="button" onClick={addCommitment}
                className="flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50">
                <Plus className="h-4 w-4" /> Add
              </button>
            </div>
          </div>

          {/* Follow-up */}
          <div className="rounded-lg border bg-white p-6 space-y-3">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.followUpRequired}
                onChange={e => setForm(prev => ({ ...prev, followUpRequired: e.target.checked }))}
                className="rounded" />
              <span className="text-sm font-medium text-gray-700">Follow-up required</span>
            </label>
            {form.followUpRequired && (
              <input type="text" value={form.followUpDescription}
                onChange={e => setForm(prev => ({ ...prev, followUpDescription: e.target.value }))}
                placeholder="What follow-up is needed?"
                className="w-full rounded-md border px-3 py-2 text-sm" />
            )}
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => router.back()}
              className="rounded-md border px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={saving}
              className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
              <Save className="h-4 w-4" />
              {saving ? 'Saving...' : 'Log Interaction'}
            </button>
          </div>
        </form>
      )}

      {/* Voice Debrief Tab */}
      {activeTab === 'voice' && (
        <div className="space-y-6">
          {/* Contact selector for voice debrief */}
          {!extraction && (
            <div className="rounded-lg border bg-white p-6">
              <label className="block text-xs font-medium text-gray-500 mb-1">Contact *</label>
              <select
                value={voiceContactId}
                onChange={e => setVoiceContactId(e.target.value)}
                className="w-full rounded-md border px-3 py-2 text-sm"
              >
                <option value="">Select contact...</option>
                {contacts.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name}{c.organization ? ` — ${c.organization}` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Recording / Processing */}
          {voiceContactId && !extraction && (
            <div className="rounded-lg border bg-white p-6">
              <VoiceDebrief
                contactId={voiceContactId}
                contactName={selectedVoiceContact?.name || ''}
                onExtractionComplete={(ext, trans) => {
                  setExtraction(ext)
                  setTranscript(trans)
                }}
              />
            </div>
          )}

          {!voiceContactId && (
            <div className="rounded-lg border bg-white p-8 text-center text-sm text-gray-400">
              Select a contact above to start recording
            </div>
          )}

          {/* Review Form */}
          {extraction && (
            <div className="rounded-lg border bg-white p-6">
              <VoiceDebriefReview
                contactId={voiceContactId}
                contactName={selectedVoiceContact?.name || ''}
                extraction={extraction}
                transcript={transcript}
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
