import { daysSince } from './utils'

interface ScoringContact {
  tier: number
  strategicValue: number
  lastInteractionDate: string | null
  targetCadenceDays: number
  categories: string[]
}

interface ScoringInteraction {
  type: string
  date: string
}

export interface CommStatsForScoring {
  totalMessages: number
  avgMessagesPerWeek: number | null
  last30DayCount: number | null
  last90DayCount: number | null
  lastMessageDate: string | null
  reciprocityRatio: number | null
  trend: string | null
}

const INTERACTION_DEPTH: Record<string, number> = {
  meeting: 10,
  coffee: 9,
  call: 8,
  event_copanel: 8,
  conference_encounter: 6,
  introduction_made: 7,
  introduction_received: 7,
  email_sent: 4,
  email_received: 5,
  text_message: 4,
  linkedin_message: 3,
  other: 3,
}

export function calculateOutreachPriority(
  contact: ScoringContact,
  latestSignalDate: string | null
): number {
  const days = daysSince(contact.lastInteractionDate)
  const overdueRatio = days !== null
    ? Math.min(days / contact.targetCadenceDays, 3.0)
    : 3.0

  let signalFreshness = 0
  if (latestSignalDate) {
    const signalDays = daysSince(latestSignalDate)
    if (signalDays !== null) {
      if (signalDays <= 1) signalFreshness = 2.0
      else if (signalDays <= 7) signalFreshness = 1.5
      else if (signalDays <= 30) signalFreshness = 1.0
    }
  }

  const tierWeight = contact.tier === 1 ? 3.0 : contact.tier === 2 ? 2.0 : 1.0

  const priority =
    (overdueRatio * 30) +
    (contact.strategicValue * 3) +
    (signalFreshness * 20) +
    (tierWeight * 10)

  return Math.min(Math.round(priority), 100)
}

/**
 * Compute relationship strength from text message data.
 * Returns 0–8 (capped — reserve 9-10 for contacts with both texts AND in-person history).
 */
export function computeTextRelationshipScore(stats: CommStatsForScoring): number {
  const textRecencyDays = stats.lastMessageDate ? daysSince(stats.lastMessageDate) : null
  const textRecency = textRecencyDays !== null
    ? 10 - Math.min(textRecencyDays / 30, 10)
    : 0

  const weeklyRate = stats.avgMessagesPerWeek || 0
  const textFrequency = Math.min(weeklyRate / 5, 1.0) * 10 // 5+ msgs/week = max

  const textDepth = Math.min(stats.totalMessages / 1000, 1.0) * 6 // 1000+ msgs = max (capped at 6)

  const raw = (textRecency * 0.4) + (textFrequency * 0.3) + (textDepth * 0.3)
  return Math.round(Math.min(raw, 8.0) * 10) / 10
}

/**
 * Compute relationship strength — blends logged interactions with text message data.
 * Takes the higher of the two sub-scores so a strong text relationship isn't diluted
 * by zero logged interactions.
 */
export function calculateRelationshipStrength(
  contact: ScoringContact,
  interactions: ScoringInteraction[],
  commStats?: CommStatsForScoring | null
): number {
  // Interaction-based score (original formula)
  const days = daysSince(contact.lastInteractionDate)
  const recency = days !== null ? 10 - Math.min(days / 30, 10) : 0

  const sixMonthsAgo = new Date()
  sixMonthsAgo.setDate(sixMonthsAgo.getDate() - 180)
  const recentInteractions = interactions.filter(
    i => new Date(i.date) >= sixMonthsAgo
  )
  const expectedInteractions = 180 / contact.targetCadenceDays
  const frequency = Math.min(recentInteractions.length / expectedInteractions, 1.0) * 10

  const avgDepth = recentInteractions.length > 0
    ? recentInteractions.reduce((sum, i) => sum + (INTERACTION_DEPTH[i.type] || 3), 0) / recentInteractions.length
    : 0

  const interactionScore = (recency * 0.4) + (frequency * 0.3) + (avgDepth * 0.3)

  // Text-based score
  const textScore = commStats ? computeTextRelationshipScore(commStats) : 0

  // Take the higher of the two
  const strength = Math.max(interactionScore, textScore)
  return Math.round(Math.min(strength, 10) * 10) / 10
}

export function calculateStrategicValue(
  contact: ScoringContact,
  betweennessCentrality: number = 0
): number {
  let base = contact.tier === 1 ? 8 : contact.tier === 2 ? 5 : 3

  const cats = contact.categories
  if (cats.some(c => c.toLowerCase().includes('prediction market'))) base += 1
  if (betweennessCentrality > 0.1) base += 1

  const strategicGoals = [
    'crypto', 'defi', 'prediction market', 'administrative law',
    'think tank', 'policy', 'media',
  ]
  const overlaps = cats.filter(c =>
    strategicGoals.some(g => c.toLowerCase().includes(g))
  ).length
  base += overlaps * 0.5

  return Math.round(Math.min(base, 10) * 10) / 10
}
