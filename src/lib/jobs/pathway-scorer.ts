import { PrismaClient } from '@prisma/client'

interface ScoringResult {
  contactId: string
  previousScore: number
  newScore: number
  evidenceCount: number
}

/**
 * Compute pathway score for a single contact based on accumulated evidence.
 * Score formula: sum of (confidence_weight * recency_decay * bridge_strength_multiplier)
 * - Recency decay: evidence older than 90 days gets 0.5x, older than 180 days gets 0.25x
 * - Bridge strength: if bridge contact is tier 1, 1.5x; tier 2, 1.2x; tier 3+, 1.0x
 */
export async function computePathwayScore(
  contactId: string,
  prisma: PrismaClient
): Promise<ScoringResult> {
  const contact = await prisma.contact.findUnique({
    where: { id: contactId },
    select: { id: true, pathwayScore: true },
  })

  if (!contact) {
    return { contactId, previousScore: 0, newScore: 0, evidenceCount: 0 }
  }

  const previousScore = (contact as Record<string, unknown>).pathwayScore as number || 0

  // Fetch all non-expired evidence for this target
  const evidence = await prisma.$queryRawUnsafe<Array<{
    confidence_weight: number
    detected_at: string
    bridge_contact_id: string | null
  }>>(
    `SELECT pe.confidence_weight, pe.detected_at, pe.bridge_contact_id
     FROM pathway_evidence pe
     WHERE pe.target_contact_id = ?
       AND (pe.expires_at IS NULL OR pe.expires_at > datetime('now'))`,
    contactId
  )

  if (evidence.length === 0) {
    // No evidence, set score to 0
    await prisma.$executeRawUnsafe(
      `UPDATE contacts SET pathway_score = 0, pathway_last_eval = datetime('now') WHERE id = ?`,
      contactId
    )
    return { contactId, previousScore, newScore: 0, evidenceCount: 0 }
  }

  // Get bridge contact tiers for multiplier
  const bridgeIds = evidence
    .filter(e => e.bridge_contact_id)
    .map(e => e.bridge_contact_id as string)

  const bridgeTiers: Record<string, number> = {}
  if (bridgeIds.length > 0) {
    const placeholders = bridgeIds.map(() => '?').join(',')
    const bridges = await prisma.$queryRawUnsafe<Array<{ id: string; tier: number }>>(
      `SELECT id, tier FROM contacts WHERE id IN (${placeholders})`,
      ...bridgeIds
    )
    for (const b of bridges) {
      bridgeTiers[b.id] = b.tier
    }
  }

  const now = Date.now()
  let totalScore = 0

  for (const e of evidence) {
    const weight = e.confidence_weight || 1.0

    // Recency decay
    const detectedMs = new Date(e.detected_at).getTime()
    const daysSince = (now - detectedMs) / (1000 * 60 * 60 * 24)
    let recencyMultiplier = 1.0
    if (daysSince > 180) recencyMultiplier = 0.25
    else if (daysSince > 90) recencyMultiplier = 0.5

    // Bridge strength multiplier
    let bridgeMultiplier = 1.0
    if (e.bridge_contact_id && bridgeTiers[e.bridge_contact_id]) {
      const tier = bridgeTiers[e.bridge_contact_id]
      if (tier === 1) bridgeMultiplier = 1.5
      else if (tier === 2) bridgeMultiplier = 1.2
    }

    totalScore += weight * recencyMultiplier * bridgeMultiplier
  }

  // Cap at 100
  const newScore = Math.min(Math.round(totalScore * 10) / 10, 100)

  await prisma.$executeRawUnsafe(
    `UPDATE contacts SET pathway_score = ?, pathway_last_eval = datetime('now') WHERE id = ?`,
    newScore,
    contactId
  )

  return { contactId, previousScore, newScore, evidenceCount: evidence.length }
}

/**
 * Run pathway scoring for all pathway and org-entry contacts.
 * Called weekly by scheduler or manually via jobs API.
 */
export async function runPathwayScorer(prisma: PrismaClient) {
  console.log('[PathwayScorer] Starting pathway score computation...')

  const contacts = await prisma.$queryRawUnsafe<Array<{ id: string; name: string }>>(
    `SELECT id, name FROM contacts WHERE outreach_mode IN ('pathway', 'org-entry')`
  )

  console.log(`[PathwayScorer] Scoring ${contacts.length} pathway/org-entry contacts`)

  const results: ScoringResult[] = []
  let changed = 0

  for (const c of contacts) {
    const result = await computePathwayScore(c.id, prisma)
    results.push(result)
    if (result.previousScore !== result.newScore) {
      changed++
      if (result.newScore >= 40) {
        console.log(`[PathwayScorer] ${c.name}: ${result.previousScore} -> ${result.newScore} (${result.evidenceCount} evidence) *** HIGH SCORE`)
      }
    }
  }

  console.log(`[PathwayScorer] Complete: ${contacts.length} scored, ${changed} changed`)

  return {
    scored: contacts.length,
    changed,
    highScoreContacts: results.filter(r => r.newScore >= 40).length,
  }
}
