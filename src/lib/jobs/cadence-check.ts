import { PrismaClient } from '@prisma/client'
import { calculateOutreachPriority } from '../scoring'
import { daysSince } from '../utils'

export async function runCadenceCheck(prisma: PrismaClient): Promise<{ generated: number; contacts: string[] }> {
  // Find contacts that are overdue based on their tier cadence
  const contacts = await prisma.contact.findMany({
    where: {
      status: { notIn: ['dormant'] },
      tier: { in: [1, 2, 3] },
    },
    include: {
      signals: { orderBy: { detectedAt: 'desc' }, take: 1 },
      outreachItems: {
        where: { status: { in: ['queued', 'drafted', 'review', 'approved'] } },
      },
    },
  })

  const generated: string[] = []

  for (const contact of contacts) {
    const days = daysSince(contact.lastInteractionDate)
    if (days === null || days < contact.targetCadenceDays) continue

    // Skip if there's already a pending outreach item
    if (contact.outreachItems.length > 0) continue

    const latestSignalDate = contact.signals[0]?.detectedAt || null
    const priority = calculateOutreachPriority(
      {
        tier: contact.tier,
        strategicValue: contact.strategicValue,
        lastInteractionDate: contact.lastInteractionDate,
        targetCadenceDays: contact.targetCadenceDays,
        categories: [],
      },
      latestSignalDate
    )

    const overdueBy = days - contact.targetCadenceDays

    await prisma.outreachQueue.create({
      data: {
        contactId: contact.id,
        triggerType: 'cadence_overdue',
        triggerDescription: `${overdueBy} days overdue (cadence: ${contact.targetCadenceDays}d, last: ${contact.lastInteractionDate || 'never'})`,
        priority: Math.max(1, Math.min(Math.round(priority / 10), 10)),
        status: 'queued',
      },
    })

    generated.push(contact.name)
  }

  return { generated: generated.length, contacts: generated }
}
