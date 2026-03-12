import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const event = await prisma.socialEvent.findUnique({
      where: { id: params.id },
      include: {
        venue: true,
        attendees: {
          include: {
            contact: { select: { id: true, name: true, photoUrl: true, personalRing: true } },
          },
        },
      },
    })

    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }
    return NextResponse.json(event)
  } catch (error) {
    console.error('[Social Event] GET error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json()
    const event = await prisma.socialEvent.update({
      where: { id: params.id },
      data: {
        ...(body.eventType && { eventType: body.eventType }),
        ...(body.title !== undefined && { title: body.title }),
        ...(body.date && { date: body.date }),
        ...(body.time !== undefined && { time: body.time }),
        ...(body.venueId !== undefined && { venueId: body.venueId }),
        ...(body.venueName !== undefined && { venueName: body.venueName }),
        ...(body.coHosted !== undefined && { coHosted: body.coHosted }),
        ...(body.notes !== undefined && { notes: body.notes }),
        ...(body.publicVisibility !== undefined && { publicVisibility: body.publicVisibility }),
        ...(body.location !== undefined && { location: body.location }),
        ...(body.description !== undefined && { description: body.description }),
      },
    })
    return NextResponse.json(event)
  } catch (error) {
    console.error('[Social Event] PUT error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await prisma.socialEvent.delete({ where: { id: params.id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Social Event] DELETE error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
