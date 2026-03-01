import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q')?.trim()

  if (!q || q.length < 2) {
    return NextResponse.json({ results: [] })
  }

  const query = `%${q}%`

  const [contacts, interactions, events, signals] = await Promise.all([
    prisma.contact.findMany({
      where: {
        OR: [
          { name: { contains: q } },
          { organization: { contains: q } },
          { title: { contains: q } },
          { notes: { contains: q } },
        ],
      },
      select: { id: true, name: true, organization: true, tier: true },
      take: 8,
    }),
    prisma.interaction.findMany({
      where: { summary: { contains: q } },
      select: { id: true, contactId: true, type: true, date: true, summary: true },
      take: 5,
    }),
    prisma.event.findMany({
      where: {
        OR: [
          { name: { contains: q } },
          { organizer: { contains: q } },
          { location: { contains: q } },
        ],
      },
      select: { id: true, name: true, dateStart: true },
      take: 5,
    }),
    prisma.intelligenceSignal.findMany({
      where: {
        OR: [
          { title: { contains: q } },
          { description: { contains: q } },
        ],
      },
      select: { id: true, contactId: true, title: true, signalType: true },
      take: 5,
    }),
  ])

  const results = [
    ...contacts.map(c => ({
      type: 'contact' as const,
      id: c.id,
      title: c.name,
      subtitle: c.organization,
      href: `/contacts/${c.id}`,
      tier: c.tier,
    })),
    ...events.map(e => ({
      type: 'event' as const,
      id: e.id,
      title: e.name,
      subtitle: e.dateStart,
      href: `/events/${e.id}`,
    })),
    ...interactions.map(i => ({
      type: 'interaction' as const,
      id: i.id,
      title: i.summary?.substring(0, 60) || i.type,
      subtitle: i.date,
      href: `/contacts/${i.contactId}`,
    })),
    ...signals.map(s => ({
      type: 'signal' as const,
      id: s.id,
      title: s.title,
      subtitle: s.signalType,
      href: `/contacts/${s.contactId}`,
    })),
  ]

  return NextResponse.json({ results })
}
