import { prisma } from '@/lib/db'
import { daysSinceLastContact, getLastMessageDates } from '@/lib/contact-activity'
import { DashboardContent } from '@/components/dashboard/DashboardContent'
import { classifyCalendarLoad } from '@/lib/calendar'
import type { CalendarMeeting, CalendarLoad, MeetingPrepRecord, CommitmentUrgency } from '@/types'

async function getDashboardData() {
  const today = new Date().toISOString().split('T')[0]

  const allContacts = await prisma.contact.findMany({
    orderBy: { lastInteractionDate: 'asc' },
  })

  const dashLastMsgDates = await getLastMessageDates(allContacts.map(c => c.id))

  const overdueContacts = allContacts.filter((c) => {
    // Skip pathway/org-entry contacts and low-accessibility contacts — they have separate gating
    const mode = (c as Record<string, unknown>).outreachMode as string | null
    const access = (c as Record<string, unknown>).accessibility as string | null
    const timing = (c as Record<string, unknown>).outreachTiming as string | null
    if (mode === 'pathway' || mode === 'org-entry') return false
    if (access === 'low') return false
    if (timing === 'wait_cftc' || timing === 'warm_intro_needed') return false

    const days = daysSinceLastContact(c.lastInteractionDate, dashLastMsgDates.get(c.id) || null)
    return days === null || days > c.targetCadenceDays
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

  // Open commitments from dedicated table
  const commitmentRows = await prisma.commitment.findMany({
    where: {
      fulfilled: false,
      OR: [
        { reminderSnoozedUntil: null },
        { reminderSnoozedUntil: { lt: today } },
      ],
    },
    include: {
      contact: { select: { name: true, organization: true } },
      interaction: { select: { date: true } },
    },
    orderBy: { dueDate: 'asc' },
  })

  const openCommitments = commitmentRows.map(c => {
    const daysOverdue = c.dueDate
      ? Math.floor((Date.now() - new Date(c.dueDate).getTime()) / (1000 * 60 * 60 * 24))
      : null

    let urgency: CommitmentUrgency = 'upcoming'
    if (c.dueDate) {
      if (c.dueDate < today) urgency = 'overdue'
      else if (c.dueDate === today) urgency = 'today'
      else {
        const daysUntil = Math.floor(
          (new Date(c.dueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
        )
        if (daysUntil <= 7) urgency = 'this_week'
      }
    }

    return {
      id: c.id,
      description: c.description,
      dueDate: c.dueDate,
      contactName: c.contact?.name || 'Unknown',
      contactId: c.contactId,
      interactionDate: c.interaction?.date || '',
      daysOverdue: daysOverdue && daysOverdue > 0 ? daysOverdue : null,
      urgency,
    }
  })

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

  // Fetch today's meeting prep briefs
  const meetingPreps = await prisma.meetingPrep.findMany({
    where: { date: today },
    orderBy: { generatedAt: 'desc' },
  })

  // Inbox pending count
  const inboxPending = await prisma.ingestionItem.count({
    where: { status: 'pending' },
  })

  // Latest 3 inbox items for preview
  const inboxPreview = await prisma.ingestionItem.findMany({
    where: { status: 'pending' },
    orderBy: { createdAt: 'desc' },
    take: 3,
    include: {
      contact: { select: { name: true } },
    },
  })

  // Personal contacts data for social section
  const personalContacts = allContacts.filter(c => {
    const ct = (c as Record<string, unknown>).contactType as string | null
    return ct === 'personal' || ct === 'both'
  })

  const overduePersonal = personalContacts.filter(c => {
    const cadence = (c as Record<string, unknown>).personalCadenceDays as number | null || 21
    const days = daysSinceLastContact(c.lastInteractionDate, dashLastMsgDates.get(c.id) || null)
    return days === null || days > cadence
  }).map(c => ({
    id: c.id,
    name: c.name,
    ring: ((c as Record<string, unknown>).personalRing as string) || 'new',
    daysSince: daysSinceLastContact(c.lastInteractionDate, dashLastMsgDates.get(c.id) || null),
    cadence: (c as Record<string, unknown>).personalCadenceDays as number || 21,
    city: (c as Record<string, unknown>).city as string | null,
    howWeMet: (c as Record<string, unknown>).howWeMet as string | null,
  })).sort((a, b) => (b.daysSince || 999) - (a.daysSince || 999)).slice(0, 10)

  const ringCounts = { close: 0, regular: 0, outer: 0, new: 0 }
  personalContacts.forEach(c => {
    const ring = ((c as Record<string, unknown>).personalRing as string) || 'new'
    if (ring in ringCounts) ringCounts[ring as keyof typeof ringCounts]++
  })

  // Upcoming life events (birthdays, etc.) for personal contacts
  const lifeEvents = await prisma.lifeEvent.findMany({
    where: { eventDate: { not: null } },
    include: { contact: { select: { id: true, name: true, contactType: true } } },
  })

  const upcomingBirthdays = lifeEvents.filter(e => {
    if (!e.contact || !['personal', 'both'].includes(e.contact.contactType)) return false
    if (!e.eventDate) return false
    const eventType = (e as Record<string, unknown>).eventType as string | null
    if (eventType && eventType !== 'birthday' && eventType !== 'custom') return false
    if (e.recurring) {
      const eventMonth = parseInt(e.eventDate.slice(5, 7))
      const eventDay = parseInt(e.eventDate.slice(8, 10))
      const now = new Date()
      for (let d = 0; d < 14; d++) {
        const check = new Date(now.getTime() + d * 86400000)
        if (check.getMonth() + 1 === eventMonth && check.getDate() === eventDay) return true
      }
      return false
    }
    return e.eventDate >= today && e.eventDate <= new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0]
  }).map(e => ({
    id: e.id,
    contactName: e.contact?.name || '',
    contactId: e.contact?.id || '',
    description: e.description,
    eventDate: e.eventDate,
    recurring: e.recurring,
  }))

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
    inboxPending,
    inboxPreview: inboxPreview.map(item => ({
      id: item.id,
      source: item.source,
      itemType: item.itemType,
      contactName: item.contact?.name || item.contactHint || 'Unknown',
      summary: (() => {
        try { return JSON.parse(item.extraction).summary?.slice(0, 100) || '' } catch { return '' }
      })(),
      createdAt: item.createdAt,
    })),
    weeklyTrends,
    todaysMeetings,
    calendarLoad,
    calendarMeetingCount,
    meetingPreps: meetingPreps.map(p => ({
      id: p.id,
      date: p.date,
      contactId: p.contactId,
      calendarEventId: p.calendarEventId,
      meetingTitle: p.meetingTitle,
      briefContent: p.briefContent,
      generatedAt: p.generatedAt,
    })) as MeetingPrepRecord[],
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
        daysSince: daysSinceLastContact(c.lastInteractionDate, dashLastMsgDates.get(c.id) || null),
      })),
    // Personal / Social section
    personalStats: {
      total: personalContacts.length,
      ringCounts,
      overdueCount: overduePersonal.length,
    },
    overduePersonal,
    upcomingBirthdays,
  }
}

export default async function DashboardPage() {
  const data = await getDashboardData()
  return <DashboardContent data={data} />
}
