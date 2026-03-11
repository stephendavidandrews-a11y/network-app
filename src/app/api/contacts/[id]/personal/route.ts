import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const contact = await prisma.contact.findUnique({
      where: { id: params.id },
      include: {
        personalInterests: { orderBy: { createdAt: 'desc' } },
        personalActivities: { orderBy: { createdAt: 'desc' } },
        personalGroupMemberships: { include: { group: true } },
        friendRelationshipsAsA: { include: { contactB: { select: { id: true, name: true, photoUrl: true } } } },
        friendRelationshipsAsB: { include: { contactA: { select: { id: true, name: true, photoUrl: true } } } },
        socialPlanAttendances: {
          include: { plan: true },
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
        lifeEvents: { orderBy: { eventDate: 'desc' } },
      },
    })

    if (!contact) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
    }

    return NextResponse.json(contact)
  } catch (error) {
    console.error('[Contact Personal] GET error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json()

    const contact = await prisma.contact.update({
      where: { id: params.id },
      data: {
        ...(body.contactType !== undefined && { contactType: body.contactType }),
        ...(body.personalRing !== undefined && { personalRing: body.personalRing }),
        ...(body.personalCadenceDays !== undefined && { personalCadenceDays: body.personalCadenceDays }),
        ...(body.howWeMet !== undefined && { howWeMet: body.howWeMet }),
        ...(body.city !== undefined && { city: body.city }),
        ...(body.neighborhood !== undefined && { neighborhood: body.neighborhood }),
        ...(body.streetAddress !== undefined && { streetAddress: body.streetAddress }),
        ...(body.stateRegion !== undefined && { stateRegion: body.stateRegion }),
        ...(body.zipCode !== undefined && { zipCode: body.zipCode }),
        ...(body.communicationPref !== undefined && { communicationPref: body.communicationPref }),
        ...(body.partnerName !== undefined && { partnerName: body.partnerName }),
        ...(body.partnerContactId !== undefined && { partnerContactId: body.partnerContactId }),
        ...(body.kids !== undefined && { kids: body.kids }),
        ...(body.dietaryNotes !== undefined && { dietaryNotes: body.dietaryNotes }),
        ...(body.availabilityNotes !== undefined && { availabilityNotes: body.availabilityNotes }),
        ...(body.emotionalContext !== undefined && { emotionalContext: body.emotionalContext }),
        ...(body.emotionalContextSet !== undefined && { emotionalContextSet: body.emotionalContextSet }),
        ...(body.reciprocityPattern !== undefined && { reciprocityPattern: body.reciprocityPattern }),
        ...(body.funnelStage !== undefined && { funnelStage: body.funnelStage }),
      },
    })

    return NextResponse.json(contact)
  } catch (error) {
    console.error('[Contact Personal] PUT error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
