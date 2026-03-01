import { prisma } from '@/lib/db'
import { DashboardContent } from '@/components/dashboard/DashboardContent'
import { classifyCalendarLoad } from '@/lib/calendar'
import type { CalendarMeeting, CalendarLoad } from '@/types'

async function getDashboardData() {
  const today = new Date().toISOString().split('T')[0]

  const allContacts = await prisma.contact.findMany({
    orderBy: { lastInteractionDate: 'asc' },
  })

  const overdueContacts = allContacts.filter((c) => {
    if (!c.lastInteractionDate) return true
    const daysSince = Math.floor(
      (Date.now() - new Date(c.lastInteractionDate).getTime()) / (1000 * 60 * 60 * 24)
    )
    return daysSince > c.targetCadenceDays
  })

  const recentSignals = await prisma.intelligenceSignal.findMany({
    take: 10,
    orderBy: { detectedAt: 'desc' },
    include: { contact: true },
  })

  const pendingOutreach = await prisma.outreachQueue.findMany({
    where: { status: { in: ['queued', 'drafted', 'review'] } },
    orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
    include: { contact: true },
  })

  // Open commitments from interactions
  const interactionsWithCommitments = await prisma.interaction.findMany({
    where: {
      commitments: { not: '[]' },
    },
    include: { contact: true },
    orderBy: { date: 'desc' },
  })

  const openCommitments: Array<{
    description: string
    dueDate: string | null
    contactName: string
    contactId: string
    interactionDate: string
    daysOverdue: number | null
  }> = []

  for (const interaction of interactionsWithCommitments) {
    try {
      const commitments = JSON.parse(interaction.commitments)
      for (const c of commitments) {
        if (!c.fulfilled) {
          const daysOverdue = c.due_date
            ? Math.floor((Date.now() - new Date(c.due_date).getTime()) / (1000 * 60 * 60 * 24))
            : null
          openCommitments.push({
            description: c.description,
            dueDate: c.due_date,
            contactName: interaction.contact.name,
            contactId: interaction.contactId,
            interactionDate: interaction.date,
            daysOverdue: daysOverdue && daysOverdue > 0 ? daysOverdue : null,
          })
        }
      }
    } catch { /* skip invalid JSON */ }
  }

  const upcomingEvents = await prisma.event.findMany({
    where: {
      dateStart: { gte: today },
    },
    orderBy: { dateStart: 'asc' },
    take: 10,
  })

  // Network health metrics
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  const contacted7d = await prisma.interaction.groupBy({
    by: ['contactId'],
    where: { date: { gte: sevenDaysAgo } },
  })

  const contacted30d = await prisma.interaction.groupBy({
    by: ['contactId'],
    where: { date: { gte: thirtyDaysAgo } },
  })

  const outreachSentThisWeek = await prisma.outreachQueue.count({
    where: {
      status: 'sent',
      sentAt: { gte: sevenDaysAgo },
    },
  })

  // Weekly trend data (last 8 weeks) for sparklines
  const weeklyTrends: Array<{ week: string; interactions: number; outreach: number }> = []
  for (let i = 7; i >= 0; i--) {
    const weekStart = new Date(Date.now() - (i + 1) * 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    const weekEnd = new Date(Date.now() - i * 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    const weekLabel = new Date(Date.now() - i * 7 * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

    const [weekInteractions, weekOutreach] = await Promise.all([
      prisma.interaction.count({ where: { date: { gte: weekStart, lt: weekEnd } } }),
      prisma.outreachQueue.count({ where: { status: 'sent', sentAt: { gte: weekStart, lt: weekEnd } } }),
    ])

    weeklyTrends.push({ week: weekLabel, interactions: weekInteractions, outreach: weekOutreach })
  }

  // Calendar data (from cache)
  const calendarCache = await prisma.calendarCache.findUnique({
    where: { date: today },
  })

  let todaysMeetings: CalendarMeeting[] = []
  let calendarLoad: CalendarLoad = 'light'
  let calendarMeetingCount = 0
  if (calendarCache) {
    try {
      const calData = JSON.parse(calendarCache.calendarData)
      todaysMeetings = calData.meetings || []
      calendarMeetingCount = calendarCache.meetingCount
      calendarLoad = classifyCalendarLoad(calendarMeetingCount)
    } catch { /* skip invalid cache */ }
  }

  const totalContacts = allContacts.length
  const overdueTier1 = overdueContacts.filter(c => c.tier === 1).length
  const overdueTier2 = overdueContacts.filter(c => c.tier === 2).length
  const overdueTier3 = overdueContacts.filter(c => c.tier === 3).length

  return {
    totalContacts,
    overdueCount: overdueContacts.length,
    overdueTier1,
    overdueTier2,
    overdueTier3,
    openCommitmentsCount: openCommitments.length,
    outreachReadyCount: pendingOutreach.length,
    contacted7d: contacted7d.length,
    contacted30d: contacted30d.length,
    outreachSentThisWeek,
    weeklyTrends,
    todaysMeetings,
    calendarLoad,
    calendarMeetingCount,
    recentSignals: recentSignals.map(s => ({
      ...s,
      contactName: s.contact.name,
      contactOrg: s.contact.organization,
    })),
    pendingOutreach: pendingOutreach.map(o => ({
      ...o,
      contactName: o.contact.name,
      contactOrg: o.contact.organization,
      contactTier: o.contact.tier,
    })),
    openCommitments: openCommitments.sort((a, b) => (b.daysOverdue || 0) - (a.daysOverdue || 0)).slice(0, 10),
    upcomingEvents,
    overdueContacts: overdueContacts
      .sort((a, b) => a.tier - b.tier)
      .slice(0, 15)
      .map((c) => ({
        ...c,
        daysSince: c.lastInteractionDate
          ? Math.floor((Date.now() - new Date(c.lastInteractionDate).getTime()) / (1000 * 60 * 60 * 24))
          : null,
      })),
  }
}

export default async function DashboardPage() {
  const data = await getDashboardData()
  return <DashboardContent data={data} />
}
