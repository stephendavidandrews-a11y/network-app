import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const contactId = searchParams.get('contactId')
  const status = searchParams.get('status')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {}
  if (contactId) where.contactId = contactId
  if (status) where.status = status

  const leads = await prisma.schedulingLead.findMany({
    where,
    include: { contact: { select: { name: true, organization: true } } },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(leads)
}

export async function POST(request: NextRequest) {
  const body = await request.json()

  if (!body.contactId && body.contactName) {
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

  // Upsert on sourceSystem + sourceId
  if (body.sourceSystem && body.sourceId) {
    const existing = await prisma.schedulingLead.findFirst({
      where: { sourceSystem: body.sourceSystem, sourceId: body.sourceId },
    })
    if (existing) {
      const updated = await prisma.schedulingLead.update({
        where: { id: existing.id },
        data: {
          description: body.description || existing.description,
          originalWords: body.originalWords || existing.originalWords,
          timeframe: body.timeframe || existing.timeframe,
        },
      })
      return NextResponse.json(updated, { status: 200 })
    }
  }

  const lead = await prisma.schedulingLead.create({
    data: {
      contactId: body.contactId,
      description: body.description,
      originalWords: body.originalWords || null,
      timeframe: body.timeframe || null,
      sourceSystem: body.sourceSystem || null,
      sourceId: body.sourceId || null,
    },
  })

  return NextResponse.json(lead, { status: 201 })
}
