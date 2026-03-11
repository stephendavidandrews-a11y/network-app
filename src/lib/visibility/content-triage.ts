import { PrismaClient } from '@prisma/client'
import { budgetedCreate, truncateForAPI } from '@/lib/api-budget'

// Tier config — determines auto-pass and scoring thresholds
const TIER_CONFIG: Record<string, { tier: number; threshold: number }> = {
  // Tier 1: CFTC + NFA — auto-pass
  government_core: { tier: 1, threshold: 0 },

  // Tier 2: Adjacent regulators — scored, lower bar
  government_adjacent: { tier: 2, threshold: 5 },

  // Tier 3: High-signal analysis
  law_firm: { tier: 3, threshold: 4 },
  academic: { tier: 3, threshold: 4 },
  legal: { tier: 3, threshold: 4 },
  think_tank: { tier: 3, threshold: 5 },
  industry_advocacy: { tier: 3, threshold: 5 },

  // Tier 4: News and commentary
  industry_conference: { tier: 4, threshold: 5 },
  news: { tier: 4, threshold: 6 },
  podcast: { tier: 4, threshold: 6 },
  dc_local: { tier: 4, threshold: 5 },
}

const MAX_AGE_DAYS = 30

// ─── Title normalization for dedup ───
function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// ─── Jaccard similarity on word sets ───
function jaccardSimilarity(a: string, b: string): number {
  const wordsA = new Set(normalizeTitle(a).split(' ').filter(w => w.length > 2))
  const wordsB = new Set(normalizeTitle(b).split(' ').filter(w => w.length > 2))
  if (wordsA.size === 0 || wordsB.size === 0) return 0
  let intersection = 0
  for (const w of wordsA) {
    if (wordsB.has(w)) intersection++
  }
  const union = wordsA.size + wordsB.size - intersection
  return union > 0 ? intersection / union : 0
}

// ─── Build calibration examples from user feedback ───
async function buildCalibrationExamples(prisma: PrismaClient): Promise<string> {
  let feedback: Array<{
    feedbackType: string
    title: string
    sourceName: string
    originalScore: number | null
    reason: string | null
  }> = []

  try {
    feedback = await prisma.triageFeedback.findMany({
      where: {
        createdAt: {
          gte: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 30,
    })
  } catch {
    // Table might not exist yet
    return ''
  }

  if (feedback.length === 0) return ''

  const falsePositives = feedback
    .filter(f => f.feedbackType === 'false_positive')
    .slice(0, 15)

  const falseNegatives = feedback
    .filter(f => f.feedbackType === 'false_negative')
    .slice(0, 15)

  let examples = '\n## Calibration from Recent Feedback\n'

  if (falsePositives.length > 0) {
    examples += '\nThese articles PASSED triage but were flagged as NOT useful. Score similar articles LOWER:\n'
    for (const fp of falsePositives) {
      examples += `- "${fp.title}" (${fp.sourceName}, scored ${fp.originalScore}) → should have been filtered${fp.reason ? '. Reason: ' + fp.reason : ''}\n`
    }
  }

  if (falseNegatives.length > 0) {
    examples += '\nThese articles were FILTERED but should have PASSED. Score similar articles HIGHER:\n'
    for (const fn of falseNegatives) {
      examples += `- "${fn.title}" (${fn.sourceName}, scored ${fn.originalScore}) → should have passed${fn.reason ? '. Reason: ' + fn.reason : ''}\n`
    }
  }

  return examples
}

// ─── Main triage function ───
export async function triageIntelContent(
  prisma: PrismaClient
): Promise<{ triaged: number; filtered: number; stale: number; deduped: number; needsFetch: number; errors: number }> {
  let triaged = 0
  let filtered = 0
  let stale = 0
  let deduped = 0
  let needsFetch = 0
  let errors = 0

  // Get new Intel discoveries
  const discoveries = await prisma.discoveredEvent.findMany({
    where: {
      status: 'new',
      source: { name: { contains: '(Intel)' } },
    },
    include: { source: { select: { name: true, category: true } } },
    orderBy: { scrapedAt: 'desc' },
    take: 200,
  })

  if (discoveries.length === 0) return { triaged, filtered, stale, deduped, needsFetch, errors }

  console.log(`[ContentTriage] Processing ${discoveries.length} Intel discoveries...`)

  // ── Phase 1: Stale content filter ──
  const cutoffDate = new Date(Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000)
  const fresh: typeof discoveries = []

  for (const d of discoveries) {
    if (d.rawDate) {
      try {
        const pubDate = new Date(d.rawDate)
        if (!isNaN(pubDate.getTime()) && pubDate < cutoffDate) {
          await prisma.discoveredEvent.update({
            where: { id: d.id },
            data: {
              status: 'filtered',
              dismissedReason: 'Stale content (published > 30 days ago)',
            },
          })
          stale++
          continue
        }
      } catch {
        // Can't parse date — let it through
      }
    }
    fresh.push(d)
  }

  if (stale > 0) {
    console.log(`[ContentTriage] Filtered ${stale} stale articles (> ${MAX_AGE_DAYS} days old)`)
  }

  // ── Phase 2: Cross-source title dedup ──
  const DEDUP_THRESHOLD = 0.6
  const kept: typeof fresh = []
  const dupIds = new Set<string>()

  for (let i = 0; i < fresh.length; i++) {
    if (dupIds.has(fresh[i].id)) continue

    let isDup = false
    for (let j = 0; j < i; j++) {
      if (dupIds.has(fresh[j].id)) continue
      const sim = jaccardSimilarity(fresh[i].rawTitle, fresh[j].rawTitle)
      if (sim >= DEDUP_THRESHOLD) {
        // Keep the one from the higher-tier (lower threshold) source
        const tierI = TIER_CONFIG[fresh[i].source.category]?.tier ?? 4
        const tierJ = TIER_CONFIG[fresh[j].source.category]?.tier ?? 4
        if (tierI <= tierJ) {
          // Keep i, mark j as dup
          dupIds.add(fresh[j].id)
          await prisma.discoveredEvent.update({
            where: { id: fresh[j].id },
            data: {
              status: 'filtered',
              dismissedReason: `Cross-source duplicate of "${fresh[i].rawTitle.substring(0, 80)}"`,
            },
          })
        } else {
          // Keep j, mark i as dup
          isDup = true
          dupIds.add(fresh[i].id)
          await prisma.discoveredEvent.update({
            where: { id: fresh[i].id },
            data: {
              status: 'filtered',
              dismissedReason: `Cross-source duplicate of "${fresh[j].rawTitle.substring(0, 80)}"`,
            },
          })
          break
        }
        deduped++
      }
    }
    if (!isDup) kept.push(fresh[i])
  }

  if (deduped > 0) {
    console.log(`[ContentTriage] Deduped ${deduped} cross-source duplicates`)
  }

  // ── Phase 3: Tier 1 auto-pass (government_core only) ──
  const tier1 = kept.filter(d => {
    const config = TIER_CONFIG[d.source.category]
    return config && config.tier === 1
  })

  for (const d of tier1) {
    await prisma.discoveredEvent.update({
      where: { id: d.id },
      data: {
        status: 'triaged',
        topicRelevanceScore: 8,
        classificationNotes: 'Auto-triaged: Tier 1 CFTC/NFA source',
      },
    })
    triaged++
  }

  if (tier1.length > 0) {
    console.log(`[ContentTriage] Auto-triaged ${tier1.length} Tier 1 (CFTC/NFA) items`)
  }

  // ── Phase 4: Score tiers 2-4 with Claude ──
  const toScore = kept.filter(d => {
    const config = TIER_CONFIG[d.source.category]
    return !config || config.tier > 1
  })

  // Build calibration examples from feedback
  const calibrationExamples = await buildCalibrationExamples(prisma)

  // Process in batches of 20
  for (let i = 0; i < toScore.length; i += 20) {
    const batch = toScore.slice(i, i + 20)

    const titleList = batch.map((d, idx) => (
      `[${idx + 1}] "${d.rawTitle}" — ${d.source.name.replace(' (Intel)', '')} (${d.source.category})${d.rawDescription ? '\n    ' + d.rawDescription.substring(0, 150) : ''}`
    )).join('\n')

    try {
      const response = await budgetedCreate({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1500,
        messages: [{
          role: 'user',
          content: `You are a triage filter for a CFTC regulatory strategist's intelligence pipeline. Score each article for whether it's worth a full read and extraction.

The strategist's focus areas (in priority order):
1. CFTC regulation, enforcement, rulemaking, jurisdiction, and personnel
2. Derivatives, swaps, futures, and clearing — regulation, market structure, enforcement
3. Digital asset regulatory frameworks — commodity vs security classification, spot market oversight
4. Prediction markets and event contracts — Kalshi, Polymarket, CEA interpretation
5. DeFi governance, protocol regulation, and crypto derivatives
6. Post-Loper Bright administrative law — agency deference, major questions doctrine, agency independence
7. Congressional legislation affecting CFTC jurisdiction (CLARITY Act, market structure bills)
8. People in the strategist's professional universe taking actions (new roles, testimony, publications, speeches)

## Scoring Guide

9-10: Directly about CFTC, NFA, or derivatives/digital asset jurisdiction. Names specific enforcement actions, rulemakings, commissioners, or legislation. "CFTC appoints new enforcement chief" = 10.

7-8: Adjacent regulatory action with clear CFTC implications. SEC crypto policy, Fed debanking rules affecting crypto firms, prediction market court rulings, congressional hearings on market structure. "Fed proposes removing reputation risk from bank supervision" = 7.

5-6: Financial regulation with indirect but real relevance. OCC stablecoin rulemaking, ISDA clearing standards, EU crypto derivatives rules, administrative law precedents that could affect agency authority. "ESMA clarifies crypto perpetual derivatives rules" = 6.

3-4: Tangentially related. General banking regulation, bank merger approvals, routine enforcement against small banks, CRA compliance, stress test scenarios, general monetary policy. "Fed approves application by regional bank" = 3.

0-2: No derivatives/digital asset/CFTC/admin law connection. Disaster relief letters, CRA exam schedules, deposit insurance approvals for unrelated banks, general FAQ updates. "FDIC issues CRA exam schedule for Q2 2026" = 0.

## Negative Examples — Score LOW
These types of articles consistently lack actionable intelligence. Score them 0-3 unless the title clearly indicates otherwise:
- Routine Fed/FDIC/OCC bank application approvals
- CRA examination schedules and compliance lists
- Disaster relief / supervisory relief letters for specific geographic areas
- Deposit insurance application approvals
- FINRA FAQ updates and suitability guidance
- Enforcement actions against individual bank employees (unless crypto/derivatives related)
- Routine press releases about board meetings, sunshine act notices
- General monetary policy speeches (unless specifically about digital assets or derivatives)
- Law firm "ranked by Chambers" / "partner named to list" announcements (unless the person is directly relevant to CFTC/derivatives)

If a title is too vague to score meaningfully (aggregator posts, weekly roundups, generic newsletter titles), return score -1 to indicate "needs fetch before scoring."
${calibrationExamples}

Score each article:

${titleList}

Return JSON array:
[{"index": 1, "score": 8, "reason": "Direct CFTC enforcement personnel change"}, ...]

Only return the JSON array.`,
        }],
      }, 'content-triage')

      const text = response.content[0].type === 'text' ? response.content[0].text : ''
      const jsonMatch = text.match(/\[[\s\S]*\]/)
      if (!jsonMatch) {
        console.error('[ContentTriage] Could not parse Claude response')
        errors += batch.length
        continue
      }

      const results = JSON.parse(jsonMatch[0]) as Array<{
        index: number
        score: number
        reason: string
      }>

      for (const result of results) {
        const discovery = batch[result.index - 1]
        if (!discovery) continue

        // Handle needs_fetch (-1 score)
        if (result.score === -1) {
          await prisma.discoveredEvent.update({
            where: { id: discovery.id },
            data: {
              status: 'needs_fetch',
              classificationNotes: result.reason,
            },
          })
          needsFetch++
          continue
        }

        const config = TIER_CONFIG[discovery.source.category] || { tier: 4, threshold: 6 }
        const passes = result.score >= config.threshold

        await prisma.discoveredEvent.update({
          where: { id: discovery.id },
          data: {
            status: passes ? 'triaged' : 'filtered',
            topicRelevanceScore: result.score,
            classificationNotes: result.reason,
            dismissedReason: passes ? null : `Below threshold (${result.score}/${config.threshold}): ${result.reason}`,
          },
        })

        if (passes) triaged++
        else filtered++
      }
    } catch (error) {
      console.error('[ContentTriage] Claude API error:', error)
      errors += batch.length
    }
  }

  console.log(`[ContentTriage] Complete: ${triaged} triaged, ${filtered} filtered, ${stale} stale, ${deduped} deduped, ${needsFetch} needs_fetch, ${errors} errors`)
  return { triaged, filtered, stale, deduped, needsFetch, errors }
}

// ─── Re-triage needs_fetch items after full text fetch ───
export async function retriageNeedsFetch(
  prisma: PrismaClient
): Promise<{ triaged: number; filtered: number; errors: number }> {
  let triaged = 0
  let filtered = 0
  let errors = 0

  const items = await prisma.discoveredEvent.findMany({
    where: { status: 'needs_fetch' },
    include: { source: { select: { name: true, category: true, parserConfig: true } } },
    take: 50,
  })

  if (items.length === 0) return { triaged, filtered, errors }

  console.log(`[ContentTriage] Re-triaging ${items.length} needs_fetch items with full text...`)

  const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': 'text/html,application/xhtml+xml',
  }

  for (const item of items) {
    if (!item.rawUrl) {
      await prisma.discoveredEvent.update({
        where: { id: item.id },
        data: { status: 'filtered', dismissedReason: 'No URL to fetch for re-triage' },
      })
      filtered++
      continue
    }

    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 15000)
      const response = await fetch(item.rawUrl, { headers: HEADERS, signal: controller.signal })
      clearTimeout(timeout)

      if (!response.ok) {
        await prisma.discoveredEvent.update({
          where: { id: item.id },
          data: { status: 'filtered', dismissedReason: `HTTP ${response.status} during re-triage fetch` },
        })
        filtered++
        continue
      }

      const html = await response.text()
      // Extract text from <p> tags
      const paragraphs: string[] = []
      const pRegex = /<p[^>]*>(.*?)<\/p>/gis
      let match
      while ((match = pRegex.exec(html)) !== null) {
        const text = match[1].replace(/<[^>]+>/g, '').trim()
        if (text.length > 20) paragraphs.push(text)
      }
      const bodyText = paragraphs.join('\n').substring(0, 5000)

      if (bodyText.length < 50) {
        await prisma.discoveredEvent.update({
          where: { id: item.id },
          data: { status: 'filtered', dismissedReason: 'Could not extract text for re-triage' },
        })
        filtered++
        continue
      }

      const config = TIER_CONFIG[item.source.category] || { tier: 4, threshold: 6 }

      const triageResponse = await budgetedCreate({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 500,
        messages: [{
          role: 'user',
          content: `Score this article for relevance to a CFTC regulatory strategist (derivatives, digital assets, prediction markets, admin law, financial regulation). 0-10 scale.

Title: "${item.rawTitle}" — ${item.source.name.replace(' (Intel)', '')}

First ~5000 chars of article text:
${bodyText}

Return JSON: {"score": 7, "reason": "brief reason"}
Only return the JSON.`,
        }],
      }, 'content-triage')

      const triageText = triageResponse.content[0].type === 'text' ? triageResponse.content[0].text : ''
      const jsonMatch = triageText.match(/\{[\s\S]*\}/)
      if (!jsonMatch) {
        errors++
        continue
      }

      const result = JSON.parse(jsonMatch[0]) as { score: number; reason: string }
      const passes = result.score >= config.threshold

      await prisma.discoveredEvent.update({
        where: { id: item.id },
        data: {
          status: passes ? 'triaged' : 'filtered',
          topicRelevanceScore: result.score,
          classificationNotes: `Re-triaged from full text: ${result.reason}`,
          dismissedReason: passes ? null : `Below threshold (${result.score}/${config.threshold}): ${result.reason}`,
        },
      })

      if (passes) triaged++
      else filtered++
    } catch (error) {
      console.log(`[ContentTriage] Re-triage error for ${item.rawTitle.substring(0, 40)}: ${String(error).substring(0, 80)}`)
      errors++
    }
  }

  console.log(`[ContentTriage] Re-triage complete: ${triaged} triaged, ${filtered} filtered, ${errors} errors`)
  return { triaged, filtered, errors }
}
