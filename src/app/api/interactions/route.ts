import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET() {
  const interactions = await prisma.interaction.findMany({
    orderBy: { date: 'desc' },
    take: 100,
    include: { contact: true },
  })
  return NextResponse.json(interactions)
}

export async function POST(request: NextRequest) {
  const body = await request.json()

  const interaction = await prisma.interaction.create({
    data: {
      contactId: body.contactId,
      type: body.type,
      date: body.date,
      summary: body.summary || null,
      commitments: JSON.stringify(body.commitments || []),
      newContactsMentioned: JSON.stringify(body.newContactsMentioned || []),
      followUpRequired: body.followUpRequired || false,
      followUpDescription: body.followUpDescription || null,
      source: body.source || 'manual',
    },
  })

  // Update contact's last interaction date
  await prisma.contact.update({
    where: { id: body.contactId },
    data: {
      lastInteractionDate: body.date,
      updatedAt: new Date().toISOString(),
    },
  })

  return NextResponse.json(interaction, { status: 201 })
}
