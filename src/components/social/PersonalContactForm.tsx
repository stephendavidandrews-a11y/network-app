'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  groups: { id: string; name: string }[]
}

export function PersonalContactForm({ groups }: Props) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSaving(true)

    const form = new FormData(e.currentTarget)
    const body = {
      name: form.get('name'),
      phone: form.get('phone') || null,
      email: form.get('email') || null,
      tier: 4,
      contactType: form.get('contactType') || 'personal',
      personalRing: form.get('personalRing') || 'new',
      personalCadenceDays: parseInt(form.get('personalCadenceDays') as string) || 21,
      howWeMet: form.get('howWeMet') || null,
      city: form.get('city') || null,
      neighborhood: form.get('neighborhood') || null,
      communicationPref: form.get('communicationPref') || null,
      partnerName: form.get('partnerName') || null,
      dietaryNotes: form.get('dietaryNotes') || null,
      availabilityNotes: form.get('availabilityNotes') || null,
      funnelStage: form.get('funnelStage') || 'new_acquaintance',
      notes: form.get('notes') || null,
      status: 'active',
    }

    try {
      const res = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) throw new Error('Failed to create contact')
      const contact = await res.json()

      // Update personal fields
      await fetch(`/api/contacts/${contact.id}/personal`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      // Add to group if selected
      const groupId = form.get('groupId')
      if (groupId) {
        await fetch(`/api/social/groups/${groupId}/members`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contactId: contact.id }),
        })
      }

      router.push(`/contacts/${contact.id}`)
    } catch (err) {
      alert('Error creating contact: ' + err)
      setSaving(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Add Friend</h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="rounded-lg bg-white p-6 shadow-sm space-y-4">
          <h2 className="font-semibold text-gray-900">Basic Info</h2>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
              <input name="name" required className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
              <input name="phone" type="tel" className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input name="email" type="email" className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
              <select name="contactType" className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm">
                <option value="personal">Personal</option>
                <option value="both">Both (Personal + Professional)</option>
              </select>
            </div>
          </div>
        </div>

        <div className="rounded-lg bg-white p-6 shadow-sm space-y-4">
          <h2 className="font-semibold text-gray-900">Social Details</h2>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ring</label>
              <select name="personalRing" className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm">
                <option value="new">New</option>
                <option value="regular">Regular</option>
                <option value="close">Close</option>
                <option value="outer">Outer</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Cadence (days)</label>
              <input name="personalCadenceDays" type="number" defaultValue="21" className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">How We Met</label>
              <input name="howWeMet" className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" placeholder="Church, law school, through Jake..." />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
              <input name="city" defaultValue="Washington, DC" className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Neighborhood</label>
              <input name="neighborhood" className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" placeholder="Capitol Hill, Georgetown..." />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Communication Pref</label>
              <select name="communicationPref" className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm">
                <option value="">Not set</option>
                <option value="texter">Texter</option>
                <option value="caller">Caller</option>
                <option value="in_person">In Person</option>
                <option value="all">All</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Partner Name</label>
              <input name="partnerName" className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Funnel Stage</label>
              <select name="funnelStage" className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm">
                <option value="new_acquaintance">New Acquaintance</option>
                <option value="party_contact">Party Contact</option>
                <option value="happy_hour">Happy Hour Regular</option>
                <option value="dinner">Dinner Guest</option>
                <option value="close_friend">Close Friend</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Group</label>
            <select name="groupId" className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm">
              <option value="">No group</option>
              {groups.map(g => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Dietary Notes</label>
              <input name="dietaryNotes" className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" placeholder="Sober, vegetarian..." />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Availability Notes</label>
              <input name="availabilityNotes" className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" placeholder="Travels Mon-Wed..." />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea name="notes" rows={3} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
          </div>
        </div>

        <div className="flex gap-3">
          <button type="submit" disabled={saving} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            {saving ? 'Saving...' : 'Add Friend'}
          </button>
          <button type="button" onClick={() => router.back()} className="rounded-md bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200">
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}
