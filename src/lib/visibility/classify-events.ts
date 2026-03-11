import { PrismaClient } from '@prisma/client'
import { budgetedCreate, truncateForAPI } from '@/lib/api-budget'

const EXPERTISE_KEYWORDS = [
  'CFTC', 'commodity futures', 'derivatives', 'Loper Bright', 'Chevron deference',
  'administrative law', 'major questions doctrine', 'digital assets', 'cryptocurrency',
  'DeFi', 'prediction markets', 'stablecoin', 'blockchain regulation',
  'financial regulation', 'SEC jurisdiction', 'swap', 'clearing', 'margin',
  'CEA', 'Commodity Exchange Act', 'rulemaking', 'notice and comment',
  'enforcement action', 'no-action letter', 'self-regulatory',
]

export async function classifyDiscoveredEvents(
  prisma: PrismaClient,
  batchSize: number = 10
): Promise<{ classified: number; dismissed: number; errors: number }> {
  let classified = 0
  let dismissed = 0
  let errors = 0

  // Get unclassified EVENT discoveries only — exclude Intel sources
  const events = await prisma.discoveredEvent.findMany({
    where: {
      status: 'new',
      source: { name: { not: { contains: '(Intel)' } } },
    },
    include: { source: { select: { name: true, category: true } } },
    orderBy: { scrapedAt: 'desc' },
    take: batchSize,
  })

  if (events.length === 0) return { classified, dismissed, errors }

  const eventSummaries = events.map((e, i) => (
    `[${i + 1}] Title: ${e.rawTitle}\nDescription: ${e.rawDescription?.substring(0, 300) || 'N/A'}\nDate: ${e.rawDate || 'Unknown'}\nLocation: ${e.rawLocation || 'Unknown'}\nSource: ${e.source.name} (${e.source.category})\nURL: ${e.rawUrl || 'N/A'}`
  )).join('\n\n---\n\n')

  try {
    const response = await budgetedCreate({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: `You are classifying discovered items for a professional who works in CFTC regulation, digital asset policy, derivatives markets, and administrative law (post-Loper Bright).

CRITICAL FIRST STEP: Determine if each item is an ACTUAL EVENT — meaning a conference, panel, hearing, webinar, roundtable, summit, workshop, lecture, symposium, or public meeting that someone could attend or speak at.

Items that are NOT events (auto-dismiss with score 0):
- News articles, blog posts, opinion pieces, editorials
- Press releases, regulatory notices, enforcement actions
- Research papers, reports, policy briefs, academic articles
- Podcast episodes, interviews, newsletters
- Product announcements, company updates
- Job postings, grant announcements

For items that ARE actual events, score them:
1. Topic relevance (0-10): how relevant to CFTC, derivatives, digital assets, admin law
2. Is there a CFP (call for papers/proposals/speakers)? Deadline if so
3. Classification: attend_only | speaking_opportunity | irrelevant

Expertise keywords: ${EXPERTISE_KEYWORDS.join(', ')}

Items to classify:

${eventSummaries}

Return JSON array:
[
  {
    "index": 1,
    "isEvent": true,
    "score": 8,
    "notes": "CFTC roundtable on digital asset clearing — direct speaking opportunity",
    "hasCfp": true,
    "cfpDeadline": "2026-04-15",
    "classification": "speaking_opportunity"
  },
  {
    "index": 2,
    "isEvent": false,
    "score": 0,
    "notes": "Blog post about crypto markets — not an event",
    "hasCfp": false,
    "cfpDeadline": null,
    "classification": "irrelevant"
  }
]

Only return the JSON array, no other text.`
      }],
    }, 'classify-events')

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    const jsonMatch = text.match(/\[[\s\S]*\]/)
    if (!jsonMatch) {
      console.error('[Classify] Could not parse Claude response')
      return { classified, dismissed, errors: events.length }
    }

    const results = JSON.parse(jsonMatch[0]) as Array<{
      index: number
      isEvent: boolean
      score: number
      notes: string
      hasCfp: boolean
      cfpDeadline: string | null
      classification: string
    }>

    for (const result of results) {
      const event = events[result.index - 1]
      if (!event) continue

      const isRelevant = result.isEvent && result.score >= 5
      const status = isRelevant ? 'classified' : 'dismissed'

      let dismissedReason: string | null = null
      if (!result.isEvent) {
        dismissedReason = `Not an event: ${result.notes}`
      } else if (result.score < 5) {
        dismissedReason = `Low relevance (${result.score}/10): ${result.notes}`
      }

      await prisma.discoveredEvent.update({
        where: { id: event.id },
        data: {
          topicRelevanceScore: result.score,
          classificationNotes: result.notes,
          hasCfp: result.hasCfp || false,
          cfpDeadline: result.cfpDeadline || null,
          status,
          dismissedReason,
        },
      })

      if (isRelevant) classified++
      else dismissed++
    }
  } catch (error) {
    console.error('[Classify] Claude API error:', error)
    errors = events.length
  }

  return { classified, dismissed, errors }
}
