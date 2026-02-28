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

export function calculateRelationshipStrength(
  contact: ScoringContact,
  interactions: ScoringInteraction[]
): number {
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

  const strength = (recency * 0.4) + (frequency * 0.3) + (avgDepth * 0.3)
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
