import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const discovered = await prisma.discoveredEvent.findUnique({
      where: { id },
      include: { source: { select: { name: true, category: true } } },
    })

    if (!discovered) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (discovered.status === 'promoted') {
      return NextResponse.json({ error: 'Already promoted' }, { status: 400 })
    }

    const body = await request.json().catch(() => ({}))

    const categoryMap: Record<string, string> = {
      industry_conference: 'conference',
      legal: 'conference',
      academic: 'symposium',
      government: 'hearing',
      think_tank: 'symposium',
      law_firm: 'cle',
      dc_local: 'meetup',
      news: 'other',
      podcast: 'other',
    }

    const event = await prisma.event.create({
      data: {
        name: body.name || discovered.rawTitle,
        organizer: body.organizer || discovered.source.name,
        location: body.location || discovered.rawLocation,
        dateStart: body.dateStart || discovered.rawDate,
        dateEnd: body.dateEnd || null,
        eventUrl: body.eventUrl || discovered.rawUrl,
        eventType: body.eventType || categoryMap[discovered.source.category] || 'conference',
        topicRelevanceScore: discovered.topicRelevanceScore || 5.0,
        topics: JSON.stringify(body.topics || []),
        hasSpeakingOpportunity: discovered.hasCfp || false,
        cfpDeadline: discovered.cfpDeadline,
        cfpStatus: discovered.hasCfp ? 'identified' : 'not_applicable',
        notes: body.notes || discovered.classificationNotes,
      },
    })

    await prisma.discoveredEvent.update({
      where: { id },
      data: { status: 'promoted', promotedEventId: event.id },
    })

    return NextResponse.json({ event, discoveredEventId: id })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
