import { PrismaClient } from '@prisma/client'
import { calculateOutreachPriority } from '../scoring'
import { daysSince } from '../utils'
import { classifyCalendarLoad, getOutreachCap } from '../calendar'

export async function runCadenceCheck(prisma: PrismaClient): Promise<{
  generated: number
  contacts: string[]
  calendarLoad: string
  outreachCap: number
}> {
  // Read today's calendar load to cap outreach volume
  const today = new Date().toISOString().split('T')[0]
  const calendarCache = await prisma.calendarCache.findUnique({ where: { date: today } })
  const meetingCount = calendarCache?.meetingCount || 0
  const calendarLoad = classifyCalendarLoad(meetingCount)
  const outreachCap = getOutreachCap(calendarLoad)

  console.log(`[Cadence Check] Calendar load: ${calendarLoad} (${meetingCount} meetings), outreach cap: ${outreachCap}`)

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

  // Collect all candidates with priority scores
  const candidates: Array<{
    contactId: string
    contactName: string
    priority: number
    overdueBy: number
    triggerDescription: string
  }> = []

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

    candidates.push({
      contactId: contact.id,
      contactName: contact.name,
      priority,
      overdueBy,
      triggerDescription: `${overdueBy} days overdue (cadence: ${contact.targetCadenceDays}d, last: ${contact.lastInteractionDate || 'never'})`,
    })
  }

  // Sort by priority descending, limit to calendar-aware cap
  candidates.sort((a, b) => b.priority - a.priority)
  const toCreate = candidates.slice(0, outreachCap)

  const generated: string[] = []

  for (const candidate of toCreate) {
    await prisma.outreachQueue.create({
      data: {
        contactId: candidate.contactId,
        triggerType: 'cadence_overdue',
        triggerDescription: candidate.triggerDescription,
        priority: Math.max(1, Math.min(Math.round(candidate.priority / 10), 10)),
        status: 'queued',
      },
    })

    generated.push(candidate.contactName)
  }

  return { generated: generated.length, contacts: generated, calendarLoad, outreachCap }
}
