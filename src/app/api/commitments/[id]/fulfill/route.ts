import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = await request.json()
  const { fulfilledNotes, queueOutreach } = body

  // Find the commitment
  const commitment = await prisma.commitment.findUnique({
    where: { id: params.id },
    include: { contact: { select: { name: true } } },
  })

  if (!commitment) {
    return NextResponse.json({ error: 'Commitment not found' }, { status: 404 })
  }

  const now = new Date().toISOString()
  const today = now.split('T')[0]

  // 1. Update the commitment in the new table
  await prisma.commitment.update({
    where: { id: params.id },
    data: {
      fulfilled: true,
      fulfilledDate: today,
      fulfilledNotes: fulfilledNotes || null,
    },
  })

  // 2. Dual-write: update legacy JSON on the parent interaction
  try {
    const interaction = await prisma.interaction.findUnique({
      where: { id: commitment.interactionId },
    })
    if (interaction) {
      const commitments = JSON.parse(interaction.commitments || '[]')
      // Find matching commitment by description
      const match = commitments.find(
        (c: { description: string }) =>
          c.description === commitment.description
      )
      if (match) {
        match.fulfilled = true
        match.fulfilled_date = today
      }
      await prisma.interaction.update({
        where: { id: commitment.interactionId },
        data: { commitments: JSON.stringify(commitments) },
      })
    }
  } catch {
    // Legacy sync is best-effort — don't fail the request
    console.warn('Failed to sync legacy JSON for commitment', params.id)
  }

  // 3. Optionally queue follow-up outreach
  if (queueOutreach) {
    await prisma.outreachQueue.create({
      data: {
        contactId: commitment.contactId,
        triggerType: 'commitment_followup',
        triggerDescription: `Fulfilled commitment: "${commitment.description}"`,
        priority: 2,
        draftSubject: `Following up: ${commitment.description}`,
        draftBody: fulfilledNotes
          ? `Hi ${commitment.contact?.name || ''},\n\nFollowing up on our conversation — ${fulfilledNotes}\n\nBest,\nStephen`
          : null,
        status: 'queued',
      },
    })
  }

  return NextResponse.json({ success: true })
}
