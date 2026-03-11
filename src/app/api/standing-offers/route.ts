import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const contactId = searchParams.get('contactId')
  const active = searchParams.get('active')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {}
  if (contactId) where.contactId = contactId
  if (active === 'true') where.active = true
  if (active === 'false') where.active = false

  const offers = await prisma.standingOffer.findMany({
    where,
    include: { contact: { select: { name: true, organization: true } } },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(offers)
}

export async function POST(request: NextRequest) {
  const body = await request.json()

  if (!body.contactId && body.contactName) {
    // Resolve contact by name
    const contact = await prisma.contact.findFirst({
      where: { name: { contains: body.contactName } },
      select: { id: true },
    })
    if (contact) body.contactId = contact.id
  }

  if (!body.contactId) {
    return NextResponse.json(
      { error: 'contactId is required (or contactName that resolves to a contact)' },
      { status: 400 }
    )
  }

  // Upsert on sourceSystem + sourceId if provided
  if (body.sourceSystem && body.sourceId) {
    const existing = await prisma.standingOffer.findFirst({
      where: { sourceSystem: body.sourceSystem, sourceId: body.sourceId },
    })
    if (existing) {
      const updated = await prisma.standingOffer.update({
        where: { id: existing.id },
        data: {
          description: body.description || existing.description,
          offeredBy: body.offeredBy || existing.offeredBy,
          originalWords: body.originalWords || existing.originalWords,
        },
      })
      return NextResponse.json(updated, { status: 200 })
    }
  }

  const offer = await prisma.standingOffer.create({
    data: {
      contactId: body.contactId,
      description: body.description,
      offeredBy: body.offeredBy || 'them',
      originalWords: body.originalWords || '',
      sourceSystem: body.sourceSystem || null,
      sourceId: body.sourceId || null,
    },
  })

  return NextResponse.json(offer, { status: 201 })
}
