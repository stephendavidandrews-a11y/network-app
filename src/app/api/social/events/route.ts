import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const eventType = request.nextUrl.searchParams.get('type')
    const upcoming = request.nextUrl.searchParams.get('upcoming')

    const where: Record<string, unknown> = {}
    if (eventType) where.eventType = eventType
    if (upcoming === 'true') {
      where.date = { gte: new Date().toISOString().split('T')[0] }
    }

    const events = await prisma.socialEvent.findMany({
      where,
      include: {
        venue: true,
        attendees: {
          include: {
            contact: { select: { id: true, name: true, photoUrl: true } },
          },
        },
      },
      orderBy: { date: 'desc' },
    })

    return NextResponse.json(events.map(e => ({
      ...e,
      attendeeCount: e.attendees.length,
    })))
  } catch (error) {
    console.error('[Social Events] GET error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    if (!body.date) {
      return NextResponse.json({ error: 'date required' }, { status: 400 })
    }

    const event = await prisma.socialEvent.create({
      data: {
        eventType: body.eventType || 'other',
        title: body.title || null,
        date: body.date,
        time: body.time || null,
        venueId: body.venueId || null,
        venueName: body.venueName || null,
        coHosted: body.coHosted || false,
        notes: body.notes || null,
      },
    })
    return NextResponse.json(event, { status: 201 })
  } catch (error) {
    console.error('[Social Events] POST error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
