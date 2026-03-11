import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const events = await prisma.lifeEvent.findMany({
    where: { contactId: id },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(events)
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json()

  // Verify contact exists
  const contact = await prisma.contact.findUnique({
    where: { id },
    select: { id: true },
  })
  if (!contact) {
    return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
  }

  // Upsert on sourceSystem + sourceId
  if (body.sourceSystem && body.sourceId) {
    const existing = await prisma.lifeEvent.findFirst({
      where: { sourceSystem: body.sourceSystem, sourceId: body.sourceId },
    })
    if (existing) {
      const updated = await prisma.lifeEvent.update({
        where: { id: existing.id },
        data: {
          description: body.description || existing.description,
          person: body.person || existing.person,
          eventDate: body.eventDate || body.date || existing.eventDate,
          recurring: body.recurring ?? existing.recurring,
        },
      })
      return NextResponse.json(updated, { status: 200 })
    }
  }

  const event = await prisma.lifeEvent.create({
    data: {
      contactId: id,
      description: body.description,
      person: body.person || body.contactName || 'unknown',
      eventDate: body.eventDate || body.date || null,
      recurring: body.recurring || false,
      sourceSystem: body.sourceSystem || null,
      sourceId: body.sourceId || null,
    },
  })

  return NextResponse.json(event, { status: 201 })
}
