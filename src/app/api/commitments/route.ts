import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const fulfilled = searchParams.get('fulfilled')
  const contactId = searchParams.get('contactId')

  const today = new Date().toISOString().split('T')[0]

  // Build where clause
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {}

  if (fulfilled === 'false') {
    where.fulfilled = false
  } else if (fulfilled === 'true') {
    where.fulfilled = true
  }

  if (contactId) {
    where.contactId = contactId
  }

  // Filter out snoozed commitments for open queries
  if (fulfilled === 'false') {
    where.OR = [
      { reminderSnoozedUntil: null },
      { reminderSnoozedUntil: { lt: today } },
    ]
  }

  const commitments = await prisma.commitment.findMany({
    where,
    include: {
      contact: { select: { name: true, organization: true } },
      interaction: { select: { date: true } },
    },
    orderBy: [{ fulfilled: 'asc' }, { dueDate: 'asc' }],
  })

  // Enrich with computed fields
  const enriched = commitments.map(c => {
    let daysOverdue: number | null = null
    if (c.dueDate && !c.fulfilled) {
      daysOverdue = Math.floor(
        (Date.now() - new Date(c.dueDate).getTime()) / (1000 * 60 * 60 * 24)
      )
      if (daysOverdue < 0) daysOverdue = null
    }

    let urgency: 'overdue' | 'today' | 'this_week' | 'upcoming' = 'upcoming'
    if (c.dueDate && !c.fulfilled) {
      const dueDate = c.dueDate
      if (dueDate < today) urgency = 'overdue'
      else if (dueDate === today) urgency = 'today'
      else {
        const daysUntil = Math.floor(
          (new Date(dueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
        )
        if (daysUntil <= 7) urgency = 'this_week'
      }
    }

    return {
      id: c.id,
      interactionId: c.interactionId,
      contactId: c.contactId,
      description: c.description,
      dueDate: c.dueDate,
      fulfilled: c.fulfilled,
      fulfilledDate: c.fulfilledDate,
      fulfilledNotes: c.fulfilledNotes,
      reminderSnoozedUntil: c.reminderSnoozedUntil,
      createdAt: c.createdAt,
      contactName: c.contact?.name || 'Unknown',
      contactOrg: c.contact?.organization || null,
      interactionDate: c.interaction?.date || '',
      daysOverdue,
      urgency,
    }
  })

  return NextResponse.json(enriched)
}
