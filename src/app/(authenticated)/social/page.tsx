import { prisma } from '@/lib/db'
import { daysSinceLastContact, getLastMessageDates } from '@/lib/contact-activity'
import { SocialDashboardContent } from '@/components/social/SocialDashboardContent'
import { computeGroupSuggestions } from '@/lib/group-suggestions'

async function getSocialData() {
  const today = new Date().toISOString().split('T')[0]

  const personalContacts = await prisma.contact.findMany({
    where: { contactType: { in: ['personal', 'both'] } },
    orderBy: { name: 'asc' },
  })

  const socialLastMsgDates = await getLastMessageDates(personalContacts.map(c => c.id))

  const overduePersonal = personalContacts.filter(c => {
    const cadence = c.personalCadenceDays || 21
    const days = daysSinceLastContact(c.lastInteractionDate, socialLastMsgDates.get(c.id) || null)
    return days === null || days > cadence
  }).map(c => ({
    id: c.id,
    name: c.name,
    ring: c.personalRing || 'new',
    daysSince: daysSinceLastContact(c.lastInteractionDate, socialLastMsgDates.get(c.id) || null),
    cadence: c.personalCadenceDays || 21,
    howWeMet: c.howWeMet,
    city: c.city,
  }))

  const lifeEvents = await prisma.lifeEvent.findMany({
    where: { eventDate: { not: null } },
    include: { contact: { select: { id: true, name: true, contactType: true } } },
    orderBy: { eventDate: 'asc' },
  })

  const upcomingEvents = lifeEvents.filter(e => {
    if (!e.contact || !['personal', 'both'].includes(e.contact.contactType)) return false
    if (!e.eventDate) return false
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
  })

  const recentPlans = await prisma.socialPlan.findMany({
    where: { status: 'completed' },
    take: 5,
    orderBy: { targetDate: 'desc' },
    include: {
      attendees: { include: { contact: { select: { id: true, name: true } } } },
    },
  })

  // Communication momentum: trend summary + growing/fading contacts
  const commStats = await prisma.textContactCommStats.findMany({
    where: { contactId: { not: null } },
    select: {
      contactId: true, trend: true, last30DayCount: true,
      last90DayCount: true, avgMessagesPerWeek: true,
    },
  })

  // Filter to personal/both contacts only
  const personalIds = new Set(personalContacts.map(c => c.id))
  const personalStats = commStats.filter(s => s.contactId && personalIds.has(s.contactId))

  const trendSummary = { growing: 0, stable: 0, fading: 0, totalMessages30d: 0 }
  const growingList: Array<{ id: string; name: string; ring: string; last30: number; avgPerWeek: number }> = []
  const fadingList: Array<{ id: string; name: string; ring: string; last30: number; avgPerWeek: number }> = []

  const nameMap = new Map(personalContacts.map(c => [c.id, { name: c.name, ring: c.personalRing || 'new' }]))

  for (const s of personalStats) {
    const trend = s.trend || 'stable'
    if (trend === 'growing') trendSummary.growing++
    else if (trend === 'fading') trendSummary.fading++
    else trendSummary.stable++
    trendSummary.totalMessages30d += s.last30DayCount || 0

    const info = nameMap.get(s.contactId!)
    if (!info) continue

    if (trend === 'growing') {
      growingList.push({ id: s.contactId!, name: info.name, ring: info.ring, last30: s.last30DayCount || 0, avgPerWeek: Math.round((s.avgMessagesPerWeek || 0) * 10) / 10 })
    } else if (trend === 'fading' && (s.last90DayCount || 0) > 0) {
      fadingList.push({ id: s.contactId!, name: info.name, ring: info.ring, last30: s.last30DayCount || 0, avgPerWeek: Math.round((s.avgMessagesPerWeek || 0) * 10) / 10 })
    }
  }

  // Sort and take top 5
  growingList.sort((a, b) => b.last30 - a.last30)
  fadingList.sort((a, b) => a.last30 - b.last30) // least recent activity first

  const ringCounts = { close: 0, regular: 0, outer: 0, new: 0 }
  personalContacts.forEach(c => {
    const ring = (c.personalRing || 'new') as keyof typeof ringCounts
    if (ring in ringCounts) ringCounts[ring]++
  })

  const groups = await prisma.personalGroup.findMany({
    include: { members: true },
    orderBy: { name: 'asc' },
  })

  // Group suggestions from chat patterns
  let groupSuggestions: Array<{
    memberIds: string[]; memberNames: string[]; suggestedName: string; sharedChatCount: number
  }> = []
  try {
    groupSuggestions = await computeGroupSuggestions()
  } catch (err) {
    console.error('Group suggestions error:', err)
  }

  return {
    totalPersonal: personalContacts.length,
    overduePersonal,
    upcomingEvents: upcomingEvents.map(e => ({
      id: e.id,
      contactName: e.contact?.name || '',
      contactId: e.contact?.id || '',
      description: e.description,
      eventType: (e as Record<string, unknown>).eventType as string || 'custom',
      eventDate: e.eventDate,
      recurring: e.recurring,
    })),
    recentEvents: recentPlans.map(p => ({
      id: p.id,
      title: p.title,
      eventType: p.planType,
      date: p.targetDate,
      attendeeCount: p.attendees.length,
      attendeeNames: p.attendees.map(a => a.contact.name).slice(0, 5),
    })),
    ringCounts,
    groups: groups.map(g => ({ id: g.id, name: g.name, memberCount: g.members.length })),
    momentum: {
      trendSummary,
      growingContacts: growingList.slice(0, 5),
      fadingContacts: fadingList.slice(0, 5),
    },
    groupSuggestions,
    upcomingPlans: await getUpcomingPlans(),
    nudgeSummary: await getNudgeSummary(),
  }
}

async function getNudgeSummary() {
  const today = new Date().toISOString().split('T')[0]
  const todayNudges = await prisma.personalNudge.findMany({
    where: { scheduledFor: today },
    select: { status: true },
  })

  const pendingCount = todayNudges.filter(n => n.status === 'pending').length
  const completedToday = todayNudges.filter(n => n.status === 'completed').length

  // Quick streak calc
  let streak = 0
  for (let d = 1; d <= 90; d++) {
    const date = new Date(Date.now() - d * 86400000).toISOString().split('T')[0]
    const completed = await prisma.personalNudge.findFirst({
      where: { scheduledFor: date, status: 'completed' },
    })
    if (completed) {
      streak++
    } else {
      break
    }
  }

  return { pendingCount, completedToday, streak }
}

async function getUpcomingPlans() {
  const plans = await prisma.socialPlan.findMany({
    where: { status: { in: ['pending', 'approved'] } },
    include: { venue: { select: { name: true } } },
    orderBy: { targetDate: 'asc' },
    take: 5,
  })
  return plans.map(p => ({
    id: p.id,
    planType: p.planType,
    targetDate: p.targetDate,
    status: p.status,
    contactCount: JSON.parse(p.suggestedContacts || '[]').length,
    venueName: p.venue?.name || null,
  }))
}

export default async function SocialDashboardPage() {
  const data = await getSocialData()
  return <SocialDashboardContent data={data} />
}
