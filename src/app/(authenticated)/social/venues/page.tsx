import { prisma } from '@/lib/db'
import { VenuesContent } from '@/components/social/VenuesContent'

export default async function VenuesPage() {
  const venues = await prisma.personalVenue.findMany({
    include: { socialEvents: { orderBy: { date: 'desc' }, take: 3 } },
    orderBy: { name: 'asc' },
  })

  const data = venues.map(v => ({
    id: v.id, name: v.name, venueType: v.venueType, neighborhood: v.neighborhood,
    city: v.city, priceRange: v.priceRange,
    goodFor: JSON.parse(v.goodFor || '[]') as string[],
    notes: v.notes, lastVisited: v.lastVisited, timesVisited: v.timesVisited,
    latitude: v.latitude, longitude: v.longitude,
    recentEvents: v.socialEvents.map(e => ({ id: e.id, title: e.title, date: e.date })),
  }))

  return <VenuesContent venues={data} />
}
