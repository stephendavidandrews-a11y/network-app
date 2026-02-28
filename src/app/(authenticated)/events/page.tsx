import { prisma } from '@/lib/db'
import { EventsPageContent } from '@/components/events/EventsPageContent'

export default async function EventsPage() {
  const events = await prisma.event.findMany({
    orderBy: { dateStart: 'asc' },
  })

  const enriched = events.map(e => ({
    ...e,
    topics: JSON.parse(e.topics || '[]') as string[],
    contactsAttending: JSON.parse(e.contactsAttending || '[]') as string[],
    contactsSpeaking: JSON.parse(e.contactsSpeaking || '[]') as string[],
  }))

  return <EventsPageContent events={enriched} />
}
