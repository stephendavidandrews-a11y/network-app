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
  cfpDeadlines: Array<{ title: string; deadline: string; source: string; url: string | null }>
  sourceHealth: Array<{ name: string; issue: string }>
  newDiscoveries: number
  contentStats: { ingested: number; extracted: number; filtered: number }
  topIntel: Array<{ title: string; publication: string; score: number; summary: string }>
  podcastEpisodes: Array<{ podcastName: string; title: string; score: number; guestNames: string[] }>
  podcastAppearances: Array<{ contactName: string; podcastName: string; episodeTitle: string }>
  regulatoryDeadlines: Array<{ summary: string; topic: string | null; source: string }>
  transitionCountdown: { daysRemaining: number; hawleyWindowContacts: Array<{ name: string; tier: number; hook: string }> } | null
  pathwayOpportunities: Array<{ name: string; tier: number; score: number; notes: string | null }>
  personalStats: { total: number; close: number; regular: number; outer: number; new: number; overdueCount: number }
  overdueFriends: Array<{ name: string; ring: string; daysSince: number | null; cadence: number }>
  upcomingBirthdays: Array<{ contactName: string; description: string; eventDate: string | null }>
}

export async function generateDailyBriefing(prisma: PrismaClient): Promise<BriefingContent> {
  const today = new Date().toISOString().split('T')[0]

  // Overdue contacts
  const contacts = await prisma.contact.findMany({
    where: { status: { notIn: ['dormant'] } },
  })

  // Filter out pathway/org-entry/low-access contacts from overdue — they have separate gating
  const directContacts = contacts.filter(c => {
    const mode = (c as Record<string, unknown>).outreachMode as string | null
    const access = (c as Record<string, unknown>).accessibility as string | null
    const timing = (c as Record<string, unknown>).outreachTiming as string | null
    if (mode === 'pathway' || mode === 'org-entry') return false
    if (access === 'low') return false
    if (timing === 'wait_cftc' || timing === 'warm_intro_needed') return false
    return true
  })

  const overdueContacts = directContacts
    .map(c => {
      const days = daysSince(c.lastInteractionDate)
      const overdue = days !== null ? days - c.targetCadenceDays : c.targetCadenceDays
      return { name: c.name, tier: c.tier, daysOverdue: overdue, lastInteraction: c.lastInteractionDate }
    })
    .filter(c => c.daysOverdue > 0)
    .sort((a, b) => a.tier - b.tier || b.daysOverdue - a.daysOverdue)
    .slice(0, 15)

  // Open commitments from dedicated table
  const commitmentRows = await prisma.commitment.findMany({
    where: {
      fulfilled: false,
      OR: [
        { reminderSnoozedUntil: null },
        { reminderSnoozedUntil: { lt: today } },
      ],
    },
    include: { contact: { select: { name: true } } },
    orderBy: { dueDate: 'asc' },
  })

  const openCommitments: BriefingContent['openCommitments'] = commitmentRows
    .map(c => ({
      description: c.description,
      contactName: c.contact?.name || 'Unknown',
      daysOverdue: Math.max(0, c.dueDate ? (daysSince(c.dueDate) || 0) : 0),
    }))
    .sort((a, b) => b.daysOverdue - a.daysOverdue)

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

  // -- Visibility: CFP Deadlines + Source Health --
  let cfpDeadlines: BriefingContent['cfpDeadlines'] = []
  let sourceHealth: BriefingContent['sourceHealth'] = []
  let newDiscoveries = 0

  try {
    const twoWeeksFuture = new Date()
    twoWeeksFuture.setDate(twoWeeksFuture.getDate() + 14)

    const cfpEvents = await prisma.discoveredEvent.findMany({
      where: {
        hasCfp: true,
        cfpDeadline: { gte: today, lte: twoWeeksFuture.toISOString().split('T')[0] },
        status: { not: 'dismissed' },
      },
      include: { source: { select: { name: true } } },
      orderBy: { cfpDeadline: 'asc' },
      take: 5,
    })

    cfpDeadlines = cfpEvents.map(e => ({
      title: e.rawTitle,
      deadline: e.cfpDeadline!,
      source: e.source.name,
      url: e.rawUrl,
    }))

    const allSources = await prisma.eventSource.findMany({ where: { enabled: true } })
    const nowMs = Date.now()
    for (const s of allSources) {
      if (s.lastError) {
        sourceHealth.push({ name: s.name, issue: `Error: ${s.lastError.substring(0, 80)}` })
      } else if (s.lastScrapedAt) {
        const freqHours: Record<string, number> = { daily: 48, weekly: 336, biweekly: 672, monthly: 1344 }
        const threshold = (freqHours[s.scrapeFrequency] || 336) * 3600000
        if (nowMs - new Date(s.lastScrapedAt).getTime() > threshold) {
          sourceHealth.push({ name: s.name, issue: `Stale: last scraped ${Math.floor((nowMs - new Date(s.lastScrapedAt).getTime()) / 86400000)}d ago` })
        }
      }
    }

    newDiscoveries = await prisma.discoveredEvent.count({
      where: {
        status: 'classified',
        topicRelevanceScore: { gte: 7 },
        scrapedAt: { gte: new Date(Date.now() - 86400000).toISOString() },
      },
    })
  } catch (error) {
    console.error('[DailyBriefing] Visibility queries failed:', error)
  }

  // -- V2: Content pipeline stats + top intel --
  let contentStats = { ingested: 0, extracted: 0, filtered: 0 }
  let topIntel: BriefingContent['topIntel'] = []
  let regulatoryDeadlines: BriefingContent['regulatoryDeadlines'] = []

  try {
    const yesterday = new Date(Date.now() - 86400000)

    // Content stats from last 24h
    const [ingestedCount, extractedCount, filteredCount] = await Promise.all([
      prisma.contentItem.count({
        where: { createdAt: { gte: yesterday.toISOString() } },
      }),
      prisma.contentItem.count({
        where: { ingestionStatus: 'extracted', createdAt: { gte: yesterday.toISOString() } },
      }),
      prisma.discoveredEvent.count({
        where: { status: 'filtered', scrapedAt: { gte: yesterday.toISOString() } },
      }),
    ])
    contentStats = { ingested: ingestedCount, extracted: extractedCount, filtered: filteredCount }

    // Top 3 highest-relevance extracted articles from yesterday
    const topItems = await prisma.contentItem.findMany({
      where: {
        ingestionStatus: 'extracted',
        topicRelevanceScore: { gte: 6 },
        createdAt: { gte: yesterday.toISOString() },
      },
      orderBy: { topicRelevanceScore: 'desc' },
      take: 3,
    })
    topIntel = topItems.map(item => ({
      title: item.title,
      publication: item.publication || 'Unknown',
      score: item.topicRelevanceScore || 0,
      summary: (item.summary || '').substring(0, 200),
    }))

    // Regulatory deadlines from recent extractions
    const deadlineExtractions = await prisma.contentExtraction.findMany({
      where: {
        extractionType: 'regulatory_signal',
        createdAt: { gte: new Date(Date.now() - 7 * 86400000).toISOString() },
      },
      include: {
        contentItem: { select: { publication: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    })
    regulatoryDeadlines = deadlineExtractions.map(ext => ({
      summary: ext.summary,
      topic: ext.topic,
      source: ext.contentItem.publication || 'Unknown',
    }))
  } catch (error) {
    console.error('[DailyBriefing] Content pipeline queries failed:', error)
  }


  // -- V3: Podcast episodes + contact appearances --
  let podcastEpisodes: BriefingContent['podcastEpisodes'] = []
  let podcastAppearances: BriefingContent['podcastAppearances'] = []

  try {
    const yesterday = new Date(Date.now() - 86400000)
    const yesterdayStr = yesterday.toISOString()

    // Tier 1 episodes from yesterday
    const recentEpisodes = await prisma.podcastEpisode.findMany({
      where: {
        publishedAt: { gte: yesterdayStr },
        podcast: { tier: 1 },
      },
      include: { podcast: { select: { name: true } } },
      orderBy: { topicRelevanceScore: 'desc' },
      take: 10,
    })

    podcastEpisodes = recentEpisodes.map(ep => ({
      podcastName: ep.podcast.name,
      title: ep.title,
      score: ep.topicRelevanceScore || 0,
      guestNames: ep.guestNames ? JSON.parse(ep.guestNames) : [],
    }))

    // Contact podcast appearances (recent signals)
    const podSignals = await prisma.intelligenceSignal.findMany({
      where: {
        signalType: 'podcast_appearance',
        detectedAt: { gte: yesterdayStr },
      },
      include: { contact: { select: { name: true } } },
      take: 10,
    })

    podcastAppearances = podSignals.map(s => ({
      contactName: s.contact?.name || 'Unknown',
      podcastName: s.sourceName || 'Unknown',
      episodeTitle: s.title,
    }))
  } catch (error) {
    console.error('[DailyBriefing] Podcast queries failed:', error)
  }

  // --- Role Transition + Pathway Intelligence ---
  let transitionCountdown: BriefingContent['transitionCountdown'] = null
  let pathwayOpportunities: BriefingContent['pathwayOpportunities'] = []

  try {
    const rtSetting = await prisma.appSetting.findUnique({ where: { key: 'role_transition' } })
    if (rtSetting) {
      const rt = JSON.parse(rtSetting.value)
      if (rt.current_role === 'hawley_gc') {
        const endDate = new Date(rt.current_role_ends + 'T23:59:59')
        const daysRemaining = Math.ceil((endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
        if (daysRemaining > 0) {
          const hawleyContacts = await prisma.contact.findMany({
            where: { outreachTiming: 'now_hawley' },
            orderBy: { tier: 'asc' },
            take: 20,
          })
          transitionCountdown = {
            daysRemaining,
            hawleyWindowContacts: hawleyContacts.map(c => {
              let hook = ''
              try {
                const hp = (c as Record<string, unknown>).hawleyPretext
                if (hp && typeof hp === 'string') {
                  const parsed = JSON.parse(hp)
                  hook = parsed.hook || ''
                }
              } catch {}
              return { name: c.name, tier: c.tier, hook }
            }),
          }
        }
      }
    }

    // High-score pathway contacts
    const pathwayContacts = await prisma.contact.findMany({
      where: {
        outreachMode: { in: ['pathway', 'org-entry'] },
        pathwayScore: { gte: 40 },
      },
      orderBy: { pathwayScore: 'desc' },
      take: 10,
    })
    pathwayOpportunities = pathwayContacts.map(c => ({
      name: c.name,
      tier: c.tier,
      score: (c as Record<string, unknown>).pathwayScore as number || 0,
      notes: (c as Record<string, unknown>).pathwayNotes as string | null,
    }))
  } catch (error) {
    console.error('[DailyBriefing] Transition/pathway queries failed:', error)
  }

  const briefing: BriefingContent = {
    date: today,
    overdueContacts,
    openCommitments: openCommitments.slice(0, 10),
    todaysMeetings: await (async () => {
      const calendarCache = await prisma.calendarCache.findUnique({ where: { date: today } })
      if (!calendarCache) return []
      try {
        const calData = JSON.parse(calendarCache.calendarData)
        return (calData.meetings || []).map((m: { start: string; summary: string; matchedContactName?: string }) => {
          const time = new Date(m.start).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
          const contact = m.matchedContactName ? ` (${m.matchedContactName})` : ''
          return `${time}: ${m.summary}${contact}`
        })
      } catch { return [] }
    })(),
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
    cfpDeadlines,
    sourceHealth,
    newDiscoveries,
    contentStats,
    topIntel,
    regulatoryDeadlines,
    podcastEpisodes,
    podcastAppearances,
    transitionCountdown,
    pathwayOpportunities,

    // Personal / Social data
    personalStats: await (async () => {
      const personal = contacts.filter(c => {
        const ct = (c as Record<string, unknown>).contactType as string | null
        return ct === 'personal' || ct === 'both'
      })
      const ringCounts = { close: 0, regular: 0, outer: 0, new: 0 }
      let overdueCount = 0
      personal.forEach(c => {
        const ring = ((c as Record<string, unknown>).personalRing as string) || 'new'
        if (ring in ringCounts) ringCounts[ring as keyof typeof ringCounts]++
        const cadence = (c as Record<string, unknown>).personalCadenceDays as number || 21
        if (!c.lastInteractionDate) { overdueCount++; return }
        const ds = daysSince(c.lastInteractionDate)
        if (ds > cadence) overdueCount++
      })
      return { total: personal.length, ...ringCounts, overdueCount }
    })(),

    overdueFriends: contacts.filter(c => {
      const ct = (c as Record<string, unknown>).contactType as string | null
      if (ct !== 'personal' && ct !== 'both') return false
      const cadence = (c as Record<string, unknown>).personalCadenceDays as number || 21
      if (!c.lastInteractionDate) return true
      return daysSince(c.lastInteractionDate) > cadence
    }).map(c => ({
      name: c.name,
      ring: ((c as Record<string, unknown>).personalRing as string) || 'new',
      daysSince: c.lastInteractionDate ? daysSince(c.lastInteractionDate) : null,
      cadence: (c as Record<string, unknown>).personalCadenceDays as number || 21,
    })).sort((a, b) => (b.daysSince || 999) - (a.daysSince || 999)).slice(0, 10),

    upcomingBirthdays: await (async () => {
      const events = await prisma.lifeEvent.findMany({
        where: { eventDate: { not: null } },
        include: { contact: { select: { name: true, contactType: true } } },
      })
      return events.filter(e => {
        if (!e.contact || !['personal', 'both'].includes(e.contact.contactType)) return false
        if (!e.eventDate || !e.recurring) return false
        const eventMonth = parseInt(e.eventDate.slice(5, 7))
        const eventDay = parseInt(e.eventDate.slice(8, 10))
        const now = new Date()
        for (let d = 0; d < 7; d++) {
          const check = new Date(now.getTime() + d * 86400000)
          if (check.getMonth() + 1 === eventMonth && check.getDate() === eventDay) return true
        }
        return false
      }).map(e => ({
        contactName: e.contact?.name || '',
        description: e.description,
        eventDate: e.eventDate,
      }))
    })(),
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
