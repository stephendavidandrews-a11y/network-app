import { prisma } from '@/lib/db'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Calendar, ExternalLink, MapPin, Users } from 'lucide-react'
import { formatDate } from '@/lib/utils'

export default async function EventDetailPage({ params }: { params: { id: string } }) {
  const event = await prisma.event.findUnique({ where: { id: params.id } })
  if (!event) notFound()

  const attendingIds = JSON.parse(event.contactsAttending || '[]') as string[]
  const speakingIds = JSON.parse(event.contactsSpeaking || '[]') as string[]
  const allIds = Array.from(new Set([...attendingIds, ...speakingIds]))
  const contacts = allIds.length > 0
    ? await prisma.contact.findMany({ where: { id: { in: allIds } }, select: { id: true, name: true, organization: true } })
    : []

  const topics = JSON.parse(event.topics || '[]') as string[]

  return (
    <div className="max-w-4xl mx-auto">
      <Link href="/events" className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4">
        <ArrowLeft className="h-4 w-4" /> Back to Events
      </Link>

      <div className="rounded-lg border bg-white p-6 space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{event.name}</h1>
            <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
              {event.dateStart && <span className="flex items-center gap-1"><Calendar className="h-4 w-4" />{formatDate(event.dateStart)}{event.dateEnd && event.dateEnd !== event.dateStart ? ` — ${formatDate(event.dateEnd)}` : ''}</span>}
              {event.location && <span className="flex items-center gap-1"><MapPin className="h-4 w-4" />{event.location}</span>}
              {event.organizer && <span>{event.organizer}</span>}
            </div>
          </div>
          <div className="flex gap-2">
            {event.attending && <span className="rounded bg-green-50 px-2 py-1 text-xs font-medium text-green-600">Attending</span>}
            {event.speaking && <span className="rounded bg-blue-50 px-2 py-1 text-xs font-medium text-blue-600">Speaking</span>}
          </div>
        </div>

        {event.eventUrl && (
          <a href={event.eventUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1">
            Event website <ExternalLink className="h-3 w-3" />
          </a>
        )}

        {topics.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold uppercase text-gray-400 mb-2">Topics</h3>
            <div className="flex gap-1">
              {topics.map(t => <span key={t} className="rounded bg-violet-50 px-2 py-0.5 text-xs text-violet-600">{t}</span>)}
            </div>
          </div>
        )}

        {event.hasSpeakingOpportunity && (
          <div className="rounded bg-amber-50 p-4">
            <h3 className="text-sm font-semibold text-amber-800">Speaking Opportunity</h3>
            <div className="text-sm text-amber-700 mt-1">
              <p>Status: {event.cfpStatus.replace(/_/g, ' ')}</p>
              {event.cfpDeadline && <p>Deadline: {formatDate(event.cfpDeadline)}</p>}
              {event.cfpUrl && <a href={event.cfpUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-700 flex items-center gap-1 mt-1">CFP Link <ExternalLink className="h-3 w-3" /></a>}
            </div>
            {event.abstractDraft && (
              <div className="mt-3">
                <h4 className="text-xs font-semibold text-amber-700">Abstract Draft</h4>
                <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">{event.abstractDraft}</p>
              </div>
            )}
          </div>
        )}

        {contacts.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold uppercase text-gray-400 mb-2 flex items-center gap-1">
              <Users className="h-4 w-4" /> Contacts
            </h3>
            <div className="space-y-1">
              {contacts.map(c => (
                <Link key={c.id} href={`/contacts/${c.id}`} className="flex items-center justify-between text-sm hover:bg-gray-50 rounded p-1.5">
                  <span className="text-gray-900">{c.name}</span>
                  <div className="flex gap-2 text-xs text-gray-400">
                    {attendingIds.includes(c.id) && <span>Attending</span>}
                    {speakingIds.includes(c.id) && <span>Speaking</span>}
                    {c.organization}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {event.notes && (
          <div>
            <h3 className="text-xs font-semibold uppercase text-gray-400 mb-1">Notes</h3>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{event.notes}</p>
          </div>
        )}
      </div>
    </div>
  )
}
