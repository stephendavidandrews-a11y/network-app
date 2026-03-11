import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json()
    const { status } = body

    if (!['approved', 'declined'].includes(status)) {
      return NextResponse.json({ error: 'Status must be approved or declined' }, { status: 400 })
    }

    const inviteRequest = await prisma.inviteRequest.findUnique({
      where: { id: params.id },
    })

    if (!inviteRequest) {
      return NextResponse.json({ error: 'Invite request not found' }, { status: 404 })
    }

    // Update the invite request
    const updated = await prisma.inviteRequest.update({
      where: { id: params.id },
      data: {
        status,
        reviewedAt: new Date().toISOString(),
      },
    })

    // If approved, create a new contact
    let newContact = null
    if (status === 'approved') {
      newContact = await prisma.contact.create({
        data: {
          name: inviteRequest.name,
          phone: inviteRequest.phone,
          contactType: 'personal',
          funnelStage: 'new_acquaintance',
          source: 'website_event_request',
          status: 'mentioned',
          tier: 4,
          howWeMet: inviteRequest.howKnowMe || 'Requested invite via website',
        },
      })
    }

    return NextResponse.json({
      success: true,
      inviteRequest: updated,
      ...(newContact && { contactId: newContact.id }),
    })
  } catch (error) {
    console.error('[Invite Requests] PATCH error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const inviteRequest = await prisma.inviteRequest.findUnique({
      where: { id: params.id },
      include: { event: { select: { id: true, title: true, date: true } } },
    })

    if (!inviteRequest) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    return NextResponse.json(inviteRequest)
  } catch (error) {
    console.error('[Invite Requests] GET error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
