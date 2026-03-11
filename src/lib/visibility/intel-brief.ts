import { PrismaClient } from '@prisma/client'
import { budgetedCreate, truncateForAPI } from '@/lib/api-budget'

export async function generateIntelBrief(
  prisma: PrismaClient
): Promise<{ weekStart: string; weekEnd: string; extractionCount: number }> {
  const now = new Date()
  const weekEnd = now.toISOString().split('T')[0]
  const weekStartDate = new Date(now)
  weekStartDate.setDate(weekStartDate.getDate() - 7)
  const weekStart = weekStartDate.toISOString().split('T')[0]

  // Check if brief already exists for this week
  const existing = await prisma.intelBrief.findFirst({
    where: { weekStart },
  })
  if (existing) {
    console.log(`[IntelBrief] Brief already exists for week of ${weekStart}`)
    return { weekStart, weekEnd, extractionCount: 0 }
  }

  // Get all extractions from the past week
  const extractions = await prisma.contentExtraction.findMany({
    where: { createdAt: { gte: weekStartDate.toISOString() } },
    include: {
      contentItem: { select: { title: true, publication: true, publishedAt: true, sourceUrl: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  if (extractions.length === 0) {
    console.log('[IntelBrief] No extractions this week')
    return { weekStart, weekEnd, extractionCount: 0 }
  }

  // Get content stats
  const contentStats = await prisma.contentItem.groupBy({
    by: ['sourceType'],
    where: { createdAt: { gte: weekStartDate.toISOString() } },
    _count: { sourceType: true },
  })

  // Format extractions for Claude
  const extractionText = extractions.map((e, i) => (
    `[${i + 1}] Type: ${e.extractionType}\nSource: ${e.contentItem.title} (${e.contentItem.publication})\nDate: ${e.contentItem.publishedAt || 'Unknown'}\nSummary: ${e.summary}${e.rawQuote ? '\nQuote: "' + e.rawQuote.substring(0, 200) + '"' : ''}${e.discoveredName ? '\nPerson: ' + e.discoveredName + (e.discoveredTitle ? ', ' + e.discoveredTitle : '') + (e.discoveredOrg ? ' at ' + e.discoveredOrg : '') : ''}${e.topic ? '\nTopic: ' + e.topic : ''}${e.position ? '\nPosition: ' + e.position : ''}`
  )).join('\n\n---\n\n')


  // Get notable podcast episodes from this week
  let episodeText = ''
  try {
    const weekEpisodes = await prisma.podcastEpisode.findMany({
      where: {
        publishedAt: { gte: weekStartDate.toISOString() },
        triageStatus: 'passed',
        ingestionStatus: 'extracted',
      },
      include: { podcast: { select: { name: true, tier: true } } },
      orderBy: { topicRelevanceScore: 'desc' },
      take: 15,
    })

    if (weekEpisodes.length > 0) {
      episodeText = '\n\n## NOTABLE EPISODES\n' +
        weekEpisodes.map(ep =>
          `${ep.podcast.name} (Tier ${ep.podcast.tier}): "${ep.title}" — Score: ${ep.topicRelevanceScore || 0}/10` +
          (ep.guestNames && ep.guestNames !== '[]' ? ` — Guests: ${JSON.parse(ep.guestNames).join(', ')}` : '') +
          (ep.isPitchWindow ? ' [PITCH WINDOW]' : '')
        ).join('\n')
    }
  } catch (error) {
    console.error('[IntelBrief] Podcast episode query failed:', error)
  }

  try {
    const response = await budgetedCreate({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      messages: [{
        role: 'user',
        content: `Synthesize this week's regulatory intelligence (${weekStart} to ${weekEnd}) into an executive briefing for a CFTC regulatory strategist.

${extractions.length} intelligence extractions from ${contentStats.map(s => `${s._count.sourceType} ${s.sourceType}`).join(', ')} sources:

${extractionText}

Organize your briefing into these sections:

## KEY DEVELOPMENTS
The 3-5 most important items this week

## REGULATORY SIGNALS
Upcoming rules, enforcement actions, comment deadlines, and regulatory developments

## POLICY POSITIONS
Notable stances from commissioners, industry groups, academics, and policymakers

## PEOPLE TO WATCH
Key figures mentioned this week — new names, job changes, influential voices

## UPCOMING EVENTS & DEADLINES
Hearings, conferences, comment periods, and other time-sensitive items

## ACTION ITEMS
Things that need attention, response, or follow-up

## NOTABLE EPISODES
Podcast episodes this week relevant to the strategist's focus areas. Include show name, episode topic, notable guests, and any pitch window opportunities.
\${episodeText}

Write in concise, executive-summary style. Be specific about names, dates, and implications.`
      }],
    }, 'intel-brief')

    const briefContent = response.content[0].type === 'text' ? response.content[0].text : ''

    const statsJson: Record<string, number> = {}
    for (const s of contentStats) {
      statsJson[s.sourceType] = s._count.sourceType
    }
    statsJson.totalExtractions = extractions.length

    await prisma.intelBrief.create({
      data: {
        weekStart,
        weekEnd,
        content: briefContent,
        contentStats: JSON.stringify(statsJson),
      },
    })

    console.log(`[IntelBrief] Generated brief for ${weekStart}: ${extractions.length} extractions synthesized`)
    return { weekStart, weekEnd, extractionCount: extractions.length }
  } catch (error) {
    console.error('[IntelBrief] Generation failed:', error)
    return { weekStart, weekEnd, extractionCount: 0 }
  }
}
