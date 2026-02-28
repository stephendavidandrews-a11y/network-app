import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET() {
  const events = await prisma.event.findMany({ orderBy: { dateStart: 'asc' } })
  return NextResponse.json(events)
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const event = await prisma.event.create({
    data: {
      name: body.name,
      organizer: body.organizer || null,
      location: body.location || null,
      dateStart: body.dateStart || null,
      dateEnd: body.dateEnd || null,
      eventUrl: body.eventUrl || null,
      eventType: body.eventType || null,
      topics: JSON.stringify(body.topics || []),
      hasSpeakingOpportunity: body.hasSpeakingOpportunity || false,
      cfpDeadline: body.cfpDeadline || null,
      cfpUrl: body.cfpUrl || null,
      cfpStatus: body.cfpStatus || 'not_applicable',
      attending: body.attending || false,
      speaking: body.speaking || false,
      notes: body.notes || null,
    },
  })
  return NextResponse.json(event, { status: 201 })
}
