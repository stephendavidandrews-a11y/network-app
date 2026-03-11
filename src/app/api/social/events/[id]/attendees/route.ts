import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json()
    if (!body.contactId) {
      return NextResponse.json({ error: 'contactId required' }, { status: 400 })
    }

    const attendee = await prisma.socialEventAttendee.create({
      data: {
        eventId: params.id,
        contactId: body.contactId,
        status: body.status || 'invited',
        wasPlusOne: body.wasPlusOne || false,
        invitedBy: body.invitedBy || null,
      },
    })
    return NextResponse.json(attendee, { status: 201 })
  } catch (error) {
    console.error('[Attendees] POST error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json()
    if (!body.contactId || !body.status) {
      return NextResponse.json({ error: 'contactId and status required' }, { status: 400 })
    }

    const attendee = await prisma.socialEventAttendee.updateMany({
      where: { eventId: params.id, contactId: body.contactId },
      data: { status: body.status },
    })
    return NextResponse.json(attendee)
  } catch (error) {
    console.error('[Attendees] PUT error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const contactId = request.nextUrl.searchParams.get('contactId')
    if (!contactId) {
      return NextResponse.json({ error: 'contactId required' }, { status: 400 })
    }

    await prisma.socialEventAttendee.deleteMany({
      where: { eventId: params.id, contactId },
    })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Attendees] DELETE error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
