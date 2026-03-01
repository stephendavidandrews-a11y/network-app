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

  // Normalize commitments — VoiceDebrief sends pre-stringified JSON
  const rawCommitments = typeof body.commitments === 'string'
    ? JSON.parse(body.commitments || '[]')
    : (body.commitments || [])

  const interaction = await prisma.interaction.create({
    data: {
      contactId: body.contactId,
      type: body.type,
      date: body.date,
      summary: body.summary || null,
      commitments: JSON.stringify(rawCommitments),
      newContactsMentioned: JSON.stringify(
        typeof body.newContactsMentioned === 'string'
          ? JSON.parse(body.newContactsMentioned || '[]')
          : (body.newContactsMentioned || [])
      ),
      followUpRequired: body.followUpRequired || false,
      followUpDescription: body.followUpDescription || null,
      source: body.source || 'manual',
    },
  })

  // Dual-write: create Commitment rows in new table
  const validCommitments = rawCommitments.filter(
    (c: { description?: string }) => c.description?.trim()
  )

  for (const c of validCommitments) {
    await prisma.commitment.create({
      data: {
        interactionId: interaction.id,
        contactId: body.contactId,
        description: c.description.trim(),
        dueDate: c.due_date || c.dueDate || null,
        fulfilled: c.fulfilled || false,
        fulfilledDate: c.fulfilled_date || c.fulfilledDate || null,
      },
    })
  }

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
