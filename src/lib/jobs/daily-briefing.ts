import { PrismaClient } from '@prisma/client'
import { daysSince } from '../utils'

interface BriefingContent {
  date: string
  overdueContacts: Array<{ name: string; tier: number; daysOverdue: number }>
  openCommitments: Array<{ description: string; contactName: string; daysOverdue: number }>
  todaysMeetings: string[]
  outreachQueue: Array<{ contactName: string; trigger: string; priority: number }>
  recentSignals: Array<{ contactName: string; title: string; type: string }>
  upcomingEvents: Array<{ name: string; dateStart: string; location: string | null }>
  networkHealth: {
    totalContacts: number
    touchedLast7d: number
    touchedLast30d: number
    overdueCount: number
  }
}

export async function generateDailyBriefing(prisma: PrismaClient): Promise<BriefingContent> {
  const today = new Date().toISOString().split('T')[0]

  // Overdue contacts
  const contacts = await prisma.contact.findMany({
    where: { status: { notIn: ['dormant'] } },
  })

  const overdueContacts = contacts
    .map(c => {
      const days = daysSince(c.lastInteractionDate)
      const overdue = days !== null ? days - c.targetCadenceDays : c.targetCadenceDays
      return { name: c.name, tier: c.tier, daysOverdue: overdue, lastInteraction: c.lastInteractionDate }
    })
    .filter(c => c.daysOverdue > 0)
    .sort((a, b) => a.tier - b.tier || b.daysOverdue - a.daysOverdue)
    .slice(0, 15)

  // Open commitments
  const interactions = await prisma.interaction.findMany({
    where: { commitments: { not: '[]' } },
    include: { contact: { select: { name: true } } },
    orderBy: { date: 'desc' },
    take: 100,
  })

  const openCommitments: BriefingContent['openCommitments'] = []
  for (const interaction of interactions) {
    let commitments: Array<{ description: string; due_date: string | null; fulfilled: boolean }> = []
    try { commitments = JSON.parse(interaction.commitments || '[]') } catch { continue }
    for (const c of commitments) {
      if (c.fulfilled) continue
      const daysOverdue = c.due_date ? (daysSince(c.due_date) || 0) : 0
      openCommitments.push({
        description: c.description,
        contactName: interaction.contact?.name || 'Unknown',
        daysOverdue: Math.max(0, daysOverdue),
      })
    }
  }
  openCommitments.sort((a, b) => b.daysOverdue - a.daysOverdue)

  // Outreach queue
  const queue = await prisma.outreachQueue.findMany({
    where: { status: { in: ['queued', 'drafted'] } },
    include: { contact: { select: { name: true } } },
    orderBy: { priority: 'asc' },
    take: 10,
  })

  // Recent signals (last 3 days)
  const threeDaysAgo = new Date()
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3)
  const signals = await prisma.intelligenceSignal.findMany({
    where: { detectedAt: { gte: threeDaysAgo.toISOString() } },
    include: { contact: { select: { name: true } } },
    orderBy: { detectedAt: 'desc' },
    take: 10,
  })

  // Upcoming events (next 14 days)
  const twoWeeksOut = new Date()
  twoWeeksOut.setDate(twoWeeksOut.getDate() + 14)
  const events = await prisma.event.findMany({
    where: {
      dateStart: { gte: today, lte: twoWeeksOut.toISOString().split('T')[0] },
    },
    orderBy: { dateStart: 'asc' },
    take: 5,
  })

  // Network health
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const touchedLast7d = contacts.filter(c =>
    c.lastInteractionDate && new Date(c.lastInteractionDate) >= sevenDaysAgo
  ).length
  const touchedLast30d = contacts.filter(c =>
    c.lastInteractionDate && new Date(c.lastInteractionDate) >= thirtyDaysAgo
  ).length

  const briefing: BriefingContent = {
    date: today,
    overdueContacts,
    openCommitments: openCommitments.slice(0, 10),
    todaysMeetings: [], // Phase 3: populated by Google Calendar integration
    outreachQueue: queue.map(q => ({
      contactName: q.contact?.name || 'Unknown',
      trigger: q.triggerDescription,
      priority: q.priority,
    })),
    recentSignals: signals.map(s => ({
      contactName: s.contact?.name || 'Unknown',
      title: s.title,
      type: s.signalType,
    })),
    upcomingEvents: events.map(e => ({
      name: e.name,
      dateStart: e.dateStart || '',
      location: e.location,
    })),
    networkHealth: {
      totalContacts: contacts.length,
      touchedLast7d,
      touchedLast30d,
      overdueCount: overdueContacts.length,
    },
  }

  // Save to database
  await prisma.dailyBriefing.upsert({
    where: { date: today },
    update: {
      content: JSON.stringify(briefing),
      generatedAt: new Date().toISOString(),
    },
    create: {
      date: today,
      content: JSON.stringify(briefing),
    },
  })

  return briefing
}
