import Anthropic from '@anthropic-ai/sdk'
import { PrismaClient } from '@prisma/client'

const client = new Anthropic()
const MAX_TEXT_LENGTH = 30000
const MAX_ITEMS_PER_RUN = 50

// ═══ Paywall / Content Quality Detection ═══

const PAYWALL_INDICATORS = [
  'subscribe to continue',
  'sign in to read',
  'premium content',
  'free trial',
  'already a subscriber',
  'create an account',
  'register to read',
  'this content is for',
  'cookie consent',
  'accept cookies',
  'you have reached your limit',
  'become a member',
  'unlock this article',
]

function assessContentQuality(text: string): 'good' | 'thin' | 'paywall' {
  if (!text || text.length < 50) return 'paywall'
  const lower = text.toLowerCase()
  const hasPaywallIndicator = PAYWALL_INDICATORS.some(p => lower.includes(p))
  if (hasPaywallIndicator && text.length < 1000) return 'paywall'
  if (text.length < 300) return 'thin'
  return 'good'
}

// ═══ Contact Context Builder ═══

async function buildContactContext(prisma: PrismaClient): Promise<string> {
  let context = ''

  try {
    // Tier 1-2 contacts — always include
    const keyContacts = await prisma.contact.findMany({
      where: { tier: { lte: 2 } },
      select: { name: true, organization: true, title: true },
    })

    if (keyContacts.length > 0) {
      context += '\n## Known Contacts (already in network — flag if mentioned but do NOT extract as person_mention):\n'
      for (const c of keyContacts) {
        context += `- ${c.name}${c.organization ? ` (${c.organization})` : ''}${c.title ? ` — ${c.title}` : ''}\n`
      }
    }

    // Recently dismissed person_mentions
    const dismissed = await (prisma as any).dismissedIntelPerson.findMany({
      select: { name: true, organization: true },
      take: 100,
      orderBy: { createdAt: 'desc' },
    })

    if (dismissed.length > 0) {
      context += '\n## Dismissed Persons (do NOT extract as person_mention):\n'
      for (const d of dismissed) {
        context += `- ${d.name}${d.organization ? ` (${d.organization})` : ''}\n`
      }
    }
  } catch (err) {
    console.log('[extractor] Contact context build warning:', err)
  }

  return context
}

// ═══ Network Status Post-Processing ═══

function fuzzyMatch(a: string, b: string): boolean {
  if (a === b) return true
  const aParts = a.split(/\s+/).filter(p => p.length > 1)
  const bParts = b.split(/\s+/).filter(p => p.length > 1)
  if (aParts.length >= 2 && bParts.length >= 2) {
    return aParts[0] === bParts[0] && aParts[aParts.length - 1] === bParts[bParts.length - 1]
  }
  return false
}

async function assignNetworkStatus(
  extractions: any[],
  prisma: PrismaClient
): Promise<any[]> {
  const personMentions = extractions.filter(e => e.type === 'person_mention' && e.discoveredName)
  if (personMentions.length === 0) return extractions

  const contacts = await prisma.contact.findMany({ select: { name: true } })
  const contactNames = contacts.map(c => c.name.toLowerCase())

  let dismissedNames: string[] = []
  try {
    const dismissed = await (prisma as any).dismissedIntelPerson.findMany({ select: { name: true } })
    dismissedNames = dismissed.map((d: any) => d.name.toLowerCase())
  } catch { /* table may not exist yet */ }

  for (const ext of personMentions) {
    const name = (ext.discoveredName || '').toLowerCase()
    if (dismissedNames.some(d => fuzzyMatch(name, d))) {
      ext.networkStatus = 'dismissed'
    } else if (contactNames.some(c => fuzzyMatch(name, c))) {
      ext.networkStatus = 'known_contact'
    } else {
      ext.networkStatus = 'new_potential'
    }
  }

  return extractions
}

// ═══ Prompt Builder ═══

function buildPrompt(item: any, textForClaude: string, contactContext: string, isThin: boolean): string {
  const thinNote = isThin
    ? '\n\nIMPORTANT: This article text appears to be truncated or incomplete. Only extract information that is explicitly stated. Do not infer or speculate. Set confidence to "low" on all extractions.\n'
    : ''

  return `You are a regulatory intelligence analyst extracting structured data for a CFTC regulatory strategist.

## Your Principal's Focus Areas (priority order)
1. CFTC regulation, enforcement, rulemaking, jurisdiction, personnel
2. Derivatives/swaps/futures regulation, clearing, market structure
3. Digital asset regulatory frameworks — commodity vs security, spot market oversight
4. Prediction markets and event contracts — Kalshi, Polymarket, CEA interpretation
5. DeFi governance, protocol regulation, crypto derivatives
6. Post-Loper Bright administrative law — agency deference, major questions, agency independence
7. Congressional legislation affecting financial regulation (CLARITY Act, GENIUS Act, market structure bills)
8. Notable people in regulatory/policy/industry taking actions (new roles, testimony, publications)

## Article
Title: ${item.title}
Source: ${item.publication || 'Unknown'}
Published: ${item.publishedAt || 'Unknown'}
${thinNote}
${textForClaude}
${contactContext}

## Instructions

Return a JSON object with two sections: article-level summary and structured extractions.

{
  "article": {
    "summary": "3-5 sentence executive summary. Write as if briefing a busy senior government attorney. What is this article about, what happened, and why does it matter? Be specific — names, dates, numbers.",
    "relevanceScore": 0-10,
    "topicTags": ["specific_topic_tags"],
    "articleType": "breaking_news | analysis | explainer | opinion | announcement | roundup",
    "coreEvent": "One sentence: what discrete event or development does this article report? Null if it's a trend piece or explainer with no specific event.",
    "whyItMatters": "One sentence: specifically why a CFTC regulatory strategist should care about this. Connect it to their work. Null if relevance score <= 3."
  },
  "extractions": [
    {
      "type": "regulatory_signal | policy_position | person_mention | event_upcoming | event_occurred | market_data | analytical_insight",
      "summary": "1-2 sentence description of this specific extraction",
      "rawQuote": "Exact quote from the article that supports this extraction. ALWAYS include when available. Only null if the extraction is inferred rather than directly stated.",
      "confidence": "high | medium | low",

      "discoveredName": "Full name or null",
      "discoveredTitle": "Current title or null",
      "discoveredOrg": "Current organization or null",
      "discoveredContext": "Why this person matters — what they did/said/announced. Be specific. Or null.",

      "position": "Clear statement of the stance taken, or null",
      "isNewPosition": true,

      "urgency": "immediate | developing | background",
      "actionableBy": "YYYY-MM-DD deadline or event date, or null",
      "topic": "primary_topic_tag"
    }
  ]
}

## Extraction Quality Rules

**regulatory_signal:**
- MUST describe a concrete regulatory action, not a vague observation about regulatory trends
- Include urgency: 'immediate' if there's a deadline or effective date within 60 days, 'developing' if pending/proposed, 'background' if informational
- Include actionableBy date when one exists (comment deadline, effective date, hearing date)

**policy_position:**
- MUST name the person or organization taking the position
- MUST state the position clearly enough that it could be cited: "[Person] at [Org] argues [specific thing]"
- Set isNewPosition: true only if this appears to be a new or shifted stance, not a reiteration
- Capture rawQuote whenever the person is directly quoted

**person_mention:**
- ONLY extract when the person is doing something professionally notable: making a substantive public statement, testifying, publishing research, changing roles, leading an initiative, or being appointed to a position
- Do NOT extract people merely mentioned in passing, listed in firm recognition announcements, or named as authors of routine documents
- Do NOT extract people listed in the "Known Contacts" or "Dismissed Persons" sections above — they are already tracked
- discoveredContext should explain WHY this person is worth knowing: "Led the Senate Agriculture Committee markup of the CLARITY Act" not just "Senator"

**event_upcoming:**
- Focus on FUTURE events: hearings, conferences, comment period deadlines, CFP deadlines, effective dates
- ALWAYS include actionableBy with the date
- These feed the strategist's visibility and speaking opportunity pipeline

**event_occurred:**
- Significant past events that change the regulatory landscape: court rulings, legislative votes, enforcement outcomes, personnel changes
- Not routine past events like "conference was held last week"

**market_data:**
- Specific quantitative facts: dollar amounts, transaction volumes, growth rates, market shares, user counts
- Include the exact number and context
- rawQuote should contain the exact sentence with the data point

**analytical_insight:**
- Qualitative observations about trends, dynamics, or implications that inform strategic thinking
- Must add genuine analytical value — not just restating the article's topic at a higher level
- Bad: "The hire signals continued law firm investment in digital asset capabilities"
- Good: "The SPOE resolution strategy's treatment of material subsidiaries during parent resolution could create complications for derivatives book transfers at failing institutions"

**General rules:**
- rawQuote: ALWAYS populate when the extraction is based on specific text. Only null for inferred extractions.
- confidence: 'high' when directly stated in text, 'medium' when reasonably inferred, 'low' when interpretive
- Prefer fewer, higher-quality extractions over many thin ones. 3 sharp extractions > 8 vague ones.
- If the article has no actionable intelligence, return empty extractions array (the article summary is still valuable).

If the article is paywalled, truncated, or contains no substantive content, return:
{"article": {"summary": "Content unavailable or insufficient for extraction", "relevanceScore": 0, "topicTags": [], "articleType": "announcement", "coreEvent": null, "whyItMatters": null}, "extractions": []}

Only return the JSON object.`
}

// ═══ Main Extraction Function ═══

export async function extractIntelContent(prisma: PrismaClient) {
  const items = await prisma.contentItem.findMany({
    where: { ingestionStatus: 'fetched' },
    take: MAX_ITEMS_PER_RUN,
    orderBy: { createdAt: 'asc' },
  })

  if (items.length === 0) {
    return { extracted: 0, skipped: 0, paywalled: 0, errors: 0, message: 'No items to extract' }
  }

  console.log(`[extractor] Processing ${items.length} items...`)

  // Build contact context once for the batch
  const contactContext = await buildContactContext(prisma)

  let extracted = 0
  let skipped = 0
  let paywalled = 0
  let errors = 0

  for (const item of items) {
    try {
      const text = item.fullText || ''
      const quality = assessContentQuality(text)

      // Handle paywall/empty content
      if (quality === 'paywall') {
        await prisma.contentItem.update({
          where: { id: item.id },
          data: { ingestionStatus: 'paywall_blocked' },
        })
        console.log(`[extractor] Paywall blocked: ${item.title.substring(0, 60)}`)
        paywalled++
        continue
      }

      const isThin = quality === 'thin'
      const textForClaude = text.length > MAX_TEXT_LENGTH ? text.substring(0, MAX_TEXT_LENGTH) + '\n\n[Text truncated]' : text
      const prompt = buildPrompt(item, textForClaude, contactContext, isThin)

      const response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4000,
        messages: [{ role: 'user', content: prompt }],
      })

      const responseText = response.content[0].type === 'text' ? response.content[0].text : ''

      // Parse JSON — handle markdown code blocks
      let cleaned = responseText.trim()
      if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
      }

      let result: any
      try {
        result = JSON.parse(cleaned)
      } catch (parseErr) {
        console.error(`[extractor] JSON parse error for ${item.title.substring(0, 50)}:`, parseErr)
        errors++
        continue
      }

      const article = result.article || {}
      const rawExtractions = result.extractions || []

      // Assign network status to person_mentions
      const processedExtractions = await assignNetworkStatus(rawExtractions, prisma)

      // Update ContentItem with article-level summary
      await prisma.contentItem.update({
        where: { id: item.id },
        data: {
          ingestionStatus: 'extracted',
          summary: article.summary || null,
          topicRelevanceScore: typeof article.relevanceScore === 'number' ? article.relevanceScore : 0,
          topicTags: JSON.stringify(article.topicTags || []),
          articleType: article.articleType || null,
          coreEvent: article.coreEvent || null,
          whyItMatters: article.whyItMatters || null,
        },
      })

      // Create ContentExtraction records
      let extractionCount = 0
      for (const ext of processedExtractions) {
        // Skip dismissed persons
        if (ext.networkStatus === 'dismissed') continue

        await prisma.contentExtraction.create({
          data: {
            contentItemId: item.id,
            extractionType: ext.type || 'analytical_insight',
            summary: ext.summary || '',
            rawQuote: ext.rawQuote || null,
            confidence: ext.confidence || 'medium',
            discoveredName: ext.discoveredName || null,
            discoveredTitle: ext.discoveredTitle || null,
            discoveredOrg: ext.discoveredOrg || null,
            discoveredContext: ext.discoveredContext || null,
            topic: ext.topic || null,
            position: ext.position || null,
            urgency: ext.urgency || null,
            isNewPosition: ext.isNewPosition === true,
            actionableBy: ext.actionableBy || null,
            networkStatus: ext.networkStatus || null,
            processed: false,
          },
        })
        extractionCount++
      }

      console.log(`[extractor] ${item.title.substring(0, 50)}... → ${extractionCount} extractions`)
      extracted++

    } catch (err) {
      console.error(`[extractor] Error processing ${item.title?.substring(0, 50)}:`, err)
      errors++
    }
  }

  const message = `Extracted ${extracted} articles (${paywalled} paywalled, ${skipped} skipped, ${errors} errors)`
  console.log(`[extractor] ${message}`)
  return { extracted, skipped, paywalled, errors, message }
}
