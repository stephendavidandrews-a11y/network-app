'use client'

import { useEffect, useState } from 'react'

interface Venue {
  id: string
  name: string
  venueType: string
  neighborhood: string | null
  city: string
  priceRange: string | null
  goodFor: string[]
  notes: string | null
  latitude: number | null
  longitude: number | null
  timesVisited: number
}

const TYPE_COLORS: Record<string, string> = {
  bar: '#ef4444',
  restaurant: '#22c55e',
  activity: '#3b82f6',
  coffee_shop: '#92400e',
  golf_course: '#0d9488',
  activity_venue: '#3b82f6',
  home: '#8b5cf6',
  other: '#6b7280',
}

const TYPE_LABELS: Record<string, string> = {
  bar: 'Bar',
  restaurant: 'Restaurant',
  activity: 'Activity',
  coffee_shop: 'Coffee Shop',
  golf_course: 'Golf Course',
  activity_venue: 'Activity Venue',
  home: 'Home',
  other: 'Other',
}

function parseNotesField(notes: string | null, field: string): string | null {
  if (!notes) return null
  const lines = notes.split('\n')
  for (const line of lines) {
    if (line.trim().toLowerCase().startsWith(field.toLowerCase())) {
      return line.trim().substring(field.length).replace(/^:\s*/, '').trim()
    }
  }
  const regex = new RegExp(field + '[:\\s]+([^.\\n]+)', 'i')
  const match = notes.match(regex)
  return match ? match[1].trim() : null
}

export default function VenueMap({ venues }: { venues: Venue[] }) {
  const [mapReady, setMapReady] = useState(false)
  const [L, setL] = useState<typeof import('leaflet') | null>(null)

  useEffect(() => {
    // Load Leaflet CSS
    if (!document.querySelector('link[href*="leaflet"]')) {
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
      document.head.appendChild(link)
    }

    // Dynamic import of leaflet
    import('leaflet').then(leaflet => {
      setL(leaflet)
      setMapReady(true)
    })
  }, [])

  useEffect(() => {
    if (!mapReady || !L) return

    const mappable = venues.filter(v => v.latitude && v.longitude)
    if (mappable.length === 0) return

    // Check if map already initialized
    const container = document.getElementById('venue-map')
    if (!container) return

    // Clear any existing map
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((container as any)._leaflet_id) {
      (container as any)._leaflet_id = null
      container.innerHTML = ''
    }

    const map = L.map('venue-map').setView([38.9072, -77.0369], 11)

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map)

    mappable.forEach(v => {
      const color = TYPE_COLORS[v.venueType] || TYPE_COLORS.other
      const address = parseNotesField(v.notes, 'Address')
      const phone = parseNotesField(v.notes, 'Phone')
      const metro = parseNotesField(v.notes, 'Nearest Metro')

      const goodForHtml = v.goodFor.slice(0, 5).map(g =>
        `<span style="display:inline-block;font-size:10px;background:#f3f4f6;border-radius:9999px;padding:1px 6px;color:#4b5563;margin:1px;">${g}</span>`
      ).join('')

      const popup = `
        <div style="font-family:system-ui,sans-serif;min-width:200px;">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4px;">
            <strong style="font-size:14px;">${v.name}</strong>
            ${v.priceRange ? `<span style="font-size:12px;color:#666;margin-left:8px;">${v.priceRange}</span>` : ''}
          </div>
          <div style="font-size:12px;color:#888;margin-bottom:6px;">
            ${TYPE_LABELS[v.venueType] || v.venueType}${v.neighborhood ? ` &middot; ${v.neighborhood}` : ''}
          </div>
          ${goodForHtml ? `<div style="display:flex;flex-wrap:wrap;gap:2px;margin-bottom:6px;">${goodForHtml}</div>` : ''}
          <div style="font-size:11px;color:#666;line-height:1.4;">
            ${address ? `<div>${address}</div>` : ''}
            ${phone ? `<div>${phone}</div>` : ''}
            ${metro ? `<div style="margin-top:2px;color:#9ca3af;">Metro: ${metro}</div>` : ''}
          </div>
          ${v.timesVisited > 0 ? `<div style="font-size:10px;color:#9ca3af;margin-top:4px;">Visited ${v.timesVisited}x</div>` : ''}
        </div>
      `

      L.circleMarker([v.latitude!, v.longitude!], {
        radius: 8,
        fillColor: color,
        color: '#fff',
        weight: 2,
        opacity: 1,
        fillOpacity: 0.85,
      }).addTo(map).bindPopup(popup)
    })

    return () => { map.remove() }
  }, [mapReady, L, venues])

  const mappable = venues.filter(v => v.latitude && v.longitude)

  return (
    <div>
      <div className="rounded-lg overflow-hidden border bg-gray-50" style={{ height: 520 }}>
        {!mapReady ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-400">Loading map...</p>
          </div>
        ) : mappable.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-400">No venues with coordinates to display</p>
          </div>
        ) : (
          <div id="venue-map" style={{ height: '100%', width: '100%' }} />
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-3 px-1">
        {[
          ['bar', 'Bar'],
          ['restaurant', 'Restaurant'],
          ['activity', 'Activity'],
          ['golf_course', 'Golf'],
          ['coffee_shop', 'Coffee Shop'],
        ].map(([type, label]) => (
          <div key={type} className="flex items-center gap-1.5">
            <span
              className="inline-block rounded-full"
              style={{ width: 10, height: 10, backgroundColor: TYPE_COLORS[type] }}
            />
            <span className="text-xs text-gray-500">{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
