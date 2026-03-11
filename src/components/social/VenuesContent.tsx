'use client'

import dynamic from 'next/dynamic'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

const VenueMap = dynamic(() => import('./VenueMap'), { ssr: false })

interface VenueData {
  id: string
  name: string
  venueType: string
  neighborhood: string | null
  city: string
  priceRange: string | null
  goodFor: string[]
  notes: string | null
  lastVisited: string | null
  timesVisited: number
  latitude: number | null
  longitude: number | null
  recentEvents: { id: string; title: string | null; date: string }[]
}

const TYPE_LABELS: Record<string, string> = {
  bar: 'Bar',
  restaurant: 'Restaurant',
  golf_course: 'Golf Course',
  park: 'Park',
  coffee_shop: 'Coffee Shop',
  activity_venue: 'Activity',
  activity: 'Activity',
  home: 'Home',
  other: 'Other',
}

export function VenuesContent({ venues }: { venues: VenueData[] }) {
  const router = useRouter()
  const [showForm, setShowForm] = useState(false)
  const [view, setView] = useState<'map' | 'list'>('map')
  const [saving, setSaving] = useState(false)

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSaving(true)
    const form = new FormData(e.currentTarget)
    const goodForStr = form.get('goodFor') as string
    const goodFor = goodForStr ? goodForStr.split(',').map(s => s.trim()).filter(Boolean) : []
    try {
      const res = await fetch('/api/social/venues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.get('name'),
          venueType: form.get('venueType') || 'other',
          neighborhood: form.get('neighborhood') || null,
          priceRange: form.get('priceRange') || null,
          goodFor,
          notes: form.get('notes') || null,
        }),
      })
      if (res.ok) router.refresh()
    } catch (err) {
      alert('Error: ' + err)
    }
    setSaving(false)
    setShowForm(false)
  }

  return (
    <div className="space-y-6">
      {/* Header with title, toggle, and add button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold text-gray-900">Venues</h1>
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setView('map')}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                view === 'map' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Map
            </button>
            <button
              onClick={() => setView('list')}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                view === 'list' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              List
            </button>
          </div>
        </div>
        <button
          onClick={() => { setShowForm(!showForm); setView('list'); }}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          {showForm ? 'Cancel' : 'Add Venue'}
        </button>
      </div>

      {/* Map View */}
      {view === 'map' && <VenueMap venues={venues} />}

      {/* List View */}
      {view === 'list' && (
        <>
          {showForm && (
            <form onSubmit={handleCreate} className="rounded-lg bg-white p-5 shadow-sm space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                  <input name="name" required className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                  <select name="venueType" className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm">
                    {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Neighborhood</label>
                  <input name="neighborhood" className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" placeholder="U Street, Georgetown..." />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Price Range</label>
                  <select name="priceRange" className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm">
                    <option value="">Not set</option>
                    <option value="$">$</option>
                    <option value="$$">$$</option>
                    <option value="$$$">$$$</option>
                    <option value="$$$$">$$$$</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Good For (comma-separated)</label>
                <input name="goodFor" className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" placeholder="small groups, outdoor, late night" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea name="notes" rows={2} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
              </div>
              <button type="submit" disabled={saving} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                {saving ? 'Saving...' : 'Add Venue'}
              </button>
            </form>
          )}

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {venues.map(v => (
              <div key={v.id} className="rounded-lg bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="font-semibold text-gray-900">{v.name}</div>
                  <span className="text-xs text-gray-500">{TYPE_LABELS[v.venueType] || v.venueType}</span>
                </div>
                <div className="text-sm text-gray-500 mt-1">
                  {v.neighborhood || v.city}
                  {v.priceRange && ` · ${v.priceRange}`}
                </div>
                {v.goodFor.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {v.goodFor.map(g => (
                      <span key={g} className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600">{g}</span>
                    ))}
                  </div>
                )}
                {v.notes && (
                  <p className="text-xs text-gray-500 mt-2 whitespace-pre-line">{v.notes}</p>
                )}
                <div className="text-xs text-gray-400 mt-2">
                  {v.timesVisited > 0 ? `Visited ${v.timesVisited}x` : 'Not visited yet'}
                  {v.lastVisited && ` · Last: ${v.lastVisited}`}
                </div>
              </div>
            ))}
          </div>

          {venues.length === 0 && !showForm && (
            <p className="text-center py-12 text-gray-500">No venues yet. Add your favorite spots!</p>
          )}
        </>
      )}
    </div>
  )
}
