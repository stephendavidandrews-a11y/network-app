'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { ArrowLeft, Save, X } from 'lucide-react'
import { CATEGORIES, TIER_CADENCE } from '@/lib/constants'

interface ContactData {
  id?: string
  name: string
  title: string | null
  organization: string | null
  email: string | null
  phone: string | null
  linkedinUrl: string | null
  twitterHandle: string | null
  personalWebsite: string | null
  tier: number
  categories: string[]
  tags: string[]
  targetCadenceDays: number
  status: string
  introductionPathway: string | null
  connectionToHawleyOrbit: string | null
  whyTheyMatter: string | null
  notes: string | null
}

export function ContactFormPage({ contact }: { contact?: ContactData }) {
  const router = useRouter()
  const isEditing = !!contact?.id
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState<ContactData>({
    name: contact?.name || '',
    title: contact?.title || '',
    organization: contact?.organization || '',
    email: contact?.email || '',
    phone: contact?.phone || '',
    linkedinUrl: contact?.linkedinUrl || '',
    twitterHandle: contact?.twitterHandle || '',
    personalWebsite: contact?.personalWebsite || '',
    tier: contact?.tier || 2,
    categories: contact?.categories || [],
    tags: contact?.tags || [],
    targetCadenceDays: contact?.targetCadenceDays || 60,
    status: contact?.status || 'target',
    introductionPathway: contact?.introductionPathway || '',
    connectionToHawleyOrbit: contact?.connectionToHawleyOrbit || '',
    whyTheyMatter: contact?.whyTheyMatter || '',
    notes: contact?.notes || '',
  })

  const [tagInput, setTagInput] = useState('')

  const updateField = (field: keyof ContactData, value: unknown) => {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  const toggleCategory = (cat: string) => {
    setForm(prev => ({
      ...prev,
      categories: prev.categories.includes(cat)
        ? prev.categories.filter(c => c !== cat)
        : [...prev.categories, cat],
    }))
  }

  const addTag = () => {
    const tag = tagInput.trim().toLowerCase().replace(/\s+/g, '_')
    if (tag && !form.tags.includes(tag)) {
      setForm(prev => ({ ...prev, tags: [...prev.tags, tag] }))
      setTagInput('')
    }
  }

  const removeTag = (tag: string) => {
    setForm(prev => ({ ...prev, tags: prev.tags.filter(t => t !== tag) }))
  }

  const handleTierChange = (tier: number) => {
    updateField('tier', tier)
    updateField('targetCadenceDays', TIER_CADENCE[tier] || 60)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) {
      setError('Name is required')
      return
    }
    setSaving(true)
    setError('')

    const body = {
      ...form,
      name: form.name.trim(),
      title: form.title || null,
      organization: form.organization || null,
      email: form.email || null,
      phone: form.phone || null,
      linkedinUrl: form.linkedinUrl || null,
      twitterHandle: form.twitterHandle || null,
      personalWebsite: form.personalWebsite || null,
      introductionPathway: form.introductionPathway || null,
      connectionToHawleyOrbit: form.connectionToHawleyOrbit || null,
      whyTheyMatter: form.whyTheyMatter || null,
      notes: form.notes || null,
    }

    try {
      const url = isEditing ? `/api/contacts/${contact.id}` : '/api/contacts'
      const res = await fetch(url, {
        method: isEditing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to save')
      }

      const data = await res.json()
      router.push(`/contacts/${data.id}`)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
      setSaving(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-2xl font-bold text-gray-900">
            {isEditing ? 'Edit Contact' : 'New Contact'}
          </h1>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Identity */}
        <div className="rounded-lg border bg-white p-6 space-y-4">
          <h2 className="text-sm font-semibold text-gray-900">Identity</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-500 mb-1">Name *</label>
              <input type="text" value={form.name} onChange={e => updateField('name', e.target.value)}
                className="w-full rounded-md border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Title / Role</label>
              <input type="text" value={form.title || ''} onChange={e => updateField('title', e.target.value)}
                className="w-full rounded-md border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Organization</label>
              <input type="text" value={form.organization || ''} onChange={e => updateField('organization', e.target.value)}
                className="w-full rounded-md border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Email</label>
              <input type="email" value={form.email || ''} onChange={e => updateField('email', e.target.value)}
                className="w-full rounded-md border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Phone</label>
              <input type="text" value={form.phone || ''} onChange={e => updateField('phone', e.target.value)}
                className="w-full rounded-md border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">LinkedIn URL</label>
              <input type="url" value={form.linkedinUrl || ''} onChange={e => updateField('linkedinUrl', e.target.value)}
                className="w-full rounded-md border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Twitter Handle</label>
              <input type="text" value={form.twitterHandle || ''} onChange={e => updateField('twitterHandle', e.target.value)}
                placeholder="username (no @)" className="w-full rounded-md border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
            </div>
          </div>
        </div>

        {/* Classification */}
        <div className="rounded-lg border bg-white p-6 space-y-4">
          <h2 className="text-sm font-semibold text-gray-900">Classification</h2>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-2">Tier</label>
            <div className="flex gap-2">
              {[1, 2, 3].map(t => (
                <button key={t} type="button" onClick={() => handleTierChange(t)}
                  className={`rounded-md border px-4 py-2 text-sm font-medium transition-colors ${
                    form.tier === t ? 'bg-blue-600 text-white border-blue-600' : 'text-gray-600 hover:bg-gray-50'
                  }`}>
                  Tier {t} ({TIER_CADENCE[t]}d)
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-2">Status</label>
            <select value={form.status} onChange={e => updateField('status', e.target.value)}
              className="rounded-md border px-3 py-2 text-sm">
              <option value="target">Target</option>
              <option value="outreach_sent">Outreach Sent</option>
              <option value="active">Active</option>
              <option value="warm">Warm</option>
              <option value="cold">Cold</option>
              <option value="dormant">Dormant</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-2">Categories</label>
            <div className="flex flex-wrap gap-1.5">
              {CATEGORIES.map(cat => (
                <button key={cat} type="button" onClick={() => toggleCategory(cat)}
                  className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                    form.categories.includes(cat)
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}>
                  {cat}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-2">Tags</label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {form.tags.map(tag => (
                <span key={tag} className="flex items-center gap-1 rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                  #{tag}
                  <button type="button" onClick={() => removeTag(tag)} className="text-gray-400 hover:text-red-500">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input type="text" value={tagInput} onChange={e => setTagInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addTag())}
                placeholder="Add tag..." className="rounded-md border px-3 py-1.5 text-sm flex-1" />
              <button type="button" onClick={addTag} className="rounded-md border px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50">Add</button>
            </div>
          </div>
        </div>

        {/* Strategic Context */}
        <div className="rounded-lg border bg-white p-6 space-y-4">
          <h2 className="text-sm font-semibold text-gray-900">Strategic Context</h2>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Why They Matter</label>
            <textarea value={form.whyTheyMatter || ''} onChange={e => updateField('whyTheyMatter', e.target.value)}
              rows={3} className="w-full rounded-md border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Connection to Hawley Orbit</label>
            <textarea value={form.connectionToHawleyOrbit || ''} onChange={e => updateField('connectionToHawleyOrbit', e.target.value)}
              rows={2} className="w-full rounded-md border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Introduction Pathway</label>
            <textarea value={form.introductionPathway || ''} onChange={e => updateField('introductionPathway', e.target.value)}
              rows={2} className="w-full rounded-md border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Notes</label>
            <textarea value={form.notes || ''} onChange={e => updateField('notes', e.target.value)}
              rows={4} className="w-full rounded-md border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-3">
          <button type="button" onClick={() => router.back()}
            className="rounded-md border px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">Cancel</button>
          <button type="submit" disabled={saving}
            className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            <Save className="h-4 w-4" />
            {saving ? 'Saving...' : (isEditing ? 'Update Contact' : 'Create Contact')}
          </button>
        </div>
      </form>
    </div>
  )
}
