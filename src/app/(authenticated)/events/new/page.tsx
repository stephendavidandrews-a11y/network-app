'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { ArrowLeft, Save } from 'lucide-react'
import { EVENT_TYPES } from '@/lib/constants'

export default function NewEventPage() {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    name: '',
    organizer: '',
    location: '',
    dateStart: '',
    dateEnd: '',
    eventUrl: '',
    eventType: 'conference',
    topics: '',
    hasSpeakingOpportunity: false,
    cfpDeadline: '',
    cfpUrl: '',
    attending: false,
    speaking: false,
    notes: '',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    await fetch('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        topics: form.topics.split(',').map(t => t.trim()).filter(Boolean),
        dateStart: form.dateStart || null,
        dateEnd: form.dateEnd || null,
        cfpDeadline: form.cfpDeadline || null,
      }),
    })
    router.push('/events')
    router.refresh()
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="text-gray-400 hover:text-gray-600">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-2xl font-bold text-gray-900">Add Event</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="rounded-lg border bg-white p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Event Name *</label>
            <input type="text" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} required
              className="w-full rounded-md border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Start Date</label>
              <input type="date" value={form.dateStart} onChange={e => setForm(p => ({ ...p, dateStart: e.target.value }))}
                className="w-full rounded-md border px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">End Date</label>
              <input type="date" value={form.dateEnd} onChange={e => setForm(p => ({ ...p, dateEnd: e.target.value }))}
                className="w-full rounded-md border px-3 py-2 text-sm" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Organizer</label>
              <input type="text" value={form.organizer} onChange={e => setForm(p => ({ ...p, organizer: e.target.value }))}
                className="w-full rounded-md border px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Location</label>
              <input type="text" value={form.location} onChange={e => setForm(p => ({ ...p, location: e.target.value }))}
                className="w-full rounded-md border px-3 py-2 text-sm" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Type</label>
              <select value={form.eventType} onChange={e => setForm(p => ({ ...p, eventType: e.target.value }))}
                className="w-full rounded-md border px-3 py-2 text-sm">
                {EVENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Topics (comma separated)</label>
              <input type="text" value={form.topics} onChange={e => setForm(p => ({ ...p, topics: e.target.value }))}
                placeholder="crypto, loper_bright, defi" className="w-full rounded-md border px-3 py-2 text-sm" />
            </div>
          </div>
          <div className="flex gap-4">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.attending} onChange={e => setForm(p => ({ ...p, attending: e.target.checked }))} className="rounded" />
              <span className="text-sm">Attending</span>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.speaking} onChange={e => setForm(p => ({ ...p, speaking: e.target.checked }))} className="rounded" />
              <span className="text-sm">Speaking</span>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.hasSpeakingOpportunity} onChange={e => setForm(p => ({ ...p, hasSpeakingOpportunity: e.target.checked }))} className="rounded" />
              <span className="text-sm">Has CFP</span>
            </label>
          </div>
          {form.hasSpeakingOpportunity && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">CFP Deadline</label>
                <input type="date" value={form.cfpDeadline} onChange={e => setForm(p => ({ ...p, cfpDeadline: e.target.value }))}
                  className="w-full rounded-md border px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">CFP URL</label>
                <input type="url" value={form.cfpUrl} onChange={e => setForm(p => ({ ...p, cfpUrl: e.target.value }))}
                  className="w-full rounded-md border px-3 py-2 text-sm" />
              </div>
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Notes</label>
            <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
              rows={3} className="w-full rounded-md border px-3 py-2 text-sm" />
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <button type="button" onClick={() => router.back()} className="rounded-md border px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">Cancel</button>
          <button type="submit" disabled={saving}
            className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            <Save className="h-4 w-4" /> {saving ? 'Saving...' : 'Add Event'}
          </button>
        </div>
      </form>
    </div>
  )
}
