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

  // Sauron upsert: if sourceSystem + sourceId provided, check for existing
  if (body.sourceSystem && body.sourceId) {
    const existing = await prisma.interaction.findFirst({
      where: { sourceSystem: body.sourceSystem, sourceId: body.sourceId },
      select: { id: true },
    })

    if (existing) {
      // Update existing interaction
      const updated = await prisma.interaction.update({
        where: { id: existing.id },
        data: {
          summary: body.summary || undefined,
          commitments: JSON.stringify(rawCommitments),
          sentiment: body.sentiment || undefined,
          relationshipDelta: body.relationshipDelta || undefined,
          relationshipNotes: body.relationshipNotes || undefined,
          topicsDiscussed: body.topicsDiscussed
            ? JSON.stringify(
                typeof body.topicsDiscussed === 'string'
                  ? JSON.parse(body.topicsDiscussed)
                  : body.topicsDiscussed
              )
            : undefined,
        },
      })

      // Delete old commitments from this source and recreate
      await prisma.commitment.deleteMany({
        where: { sourceSystem: body.sourceSystem, sourceId: body.sourceId },
      })

      const validCommitments = rawCommitments.filter(
        (c: { description?: string }) => c.description?.trim()
      )

      for (const c of validCommitments) {
        await prisma.commitment.create({
          data: {
            interactionId: existing.id,
            contactId: body.contactId,
            description: c.description.trim(),
            dueDate: c.due_date || c.dueDate || null,
            fulfilled: c.fulfilled || false,
            fulfilledDate: c.fulfilled_date || c.fulfilledDate || null,
            sourceSystem: body.sourceSystem,
            sourceId: body.sourceId,
            sourceClaimId: c.sourceClaimId || null,
          },
        })
      }

      return NextResponse.json(updated, { status: 200 })
    }
  }

  // Normal create path (with new source fields)
  const interaction = await prisma.interaction.create({
    data: {
      contactId: body.contactId,
      type: body.type || 'meeting',
      date: body.date || new Date().toISOString().split('T')[0],
      summary: body.summary || null,
      commitments: JSON.stringify(rawCommitments),
      newContactsMentioned: JSON.stringify(
        typeof body.newContactsMentioned === 'string'
          ? JSON.parse(body.newContactsMentioned || '[]')
          : (body.newContactsMentioned || [])
      ),
      followUpRequired: body.followUpRequired || false,
      followUpDescription: body.followUpDescription || null,
      sentiment: body.sentiment || null,
      relationshipDelta: body.relationshipDelta || null,
      relationshipNotes: body.relationshipNotes || null,
      topicsDiscussed: body.topicsDiscussed
        ? JSON.stringify(
            typeof body.topicsDiscussed === 'string'
              ? JSON.parse(body.topicsDiscussed)
              : body.topicsDiscussed
          )
        : '[]',
      source: body.source || 'manual',
      sourceSystem: body.sourceSystem || null,
      sourceId: body.sourceId || null,
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
        sourceSystem: body.sourceSystem || null,
        sourceId: body.sourceId || null,
        sourceClaimId: c.sourceClaimId || null,
      },
    })
  }

  // Update contact's last interaction date
  if (body.contactId) {
    await prisma.contact.update({
      where: { id: body.contactId },
      data: {
        lastInteractionDate: body.date || new Date().toISOString().split('T')[0],
        updatedAt: new Date().toISOString(),
      },
    })
  }

  return NextResponse.json(interaction, { status: 201 })
}
