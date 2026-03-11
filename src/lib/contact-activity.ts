/**
 * Shared helper: compute "days since last contact" using both
 * logged interactions AND text messages (comm stats).
 *
 * Texts are a form of interaction — if someone has 3,000 texts
 * but no logged meeting, they are NOT "never contacted".
 */

import { prisma } from './db'
import type { CommStatsForScoring } from './scoring'

// Re-export the type for convenience
export type { CommStatsForScoring }

/**
 * For a single contact, return days since last contact considering
 * both lastInteractionDate and text comm stats.
 */
export function daysSinceLastContact(
  lastInteractionDate: string | Date | null,
  lastMessageDate: string | Date | null,
): number | null {
  const interactionMs = lastInteractionDate ? new Date(lastInteractionDate).getTime() : 0
  const textMs = lastMessageDate ? new Date(lastMessageDate).getTime() : 0
  const lastMs = Math.max(interactionMs, textMs)
  if (lastMs === 0) return null
  return Math.floor((Date.now() - lastMs) / (1000 * 60 * 60 * 24))
}

/**
 * Bulk-fetch last message dates for a list of contact IDs.
 * Returns a Map<contactId, lastMessageDate>.
 */
export async function getLastMessageDates(
  contactIds: string[],
): Promise<Map<string, string>> {
  if (contactIds.length === 0) return new Map()

  const stats = await prisma.textContactCommStats.findMany({
    where: { contactId: { in: contactIds } },
    select: { contactId: true, lastMessageDate: true },
  })

  const map = new Map<string, string>()
  for (const s of stats) {
    if (s.contactId && s.lastMessageDate) {
      map.set(s.contactId, s.lastMessageDate)
    }
  }
  return map
}

/**
 * Bulk-fetch full comm stats for a list of contact IDs.
 * Returns a Map<contactId, CommStatsForScoring>.
 */
export async function getCommStatsMap(
  contactIds: string[],
): Promise<Map<string, CommStatsForScoring>> {
  if (contactIds.length === 0) return new Map()

  const stats = await prisma.textContactCommStats.findMany({
    where: { contactId: { in: contactIds } },
    select: {
      contactId: true,
      totalMessages: true,
      avgMessagesPerWeek: true,
      last30DayCount: true,
      last90DayCount: true,
      lastMessageDate: true,
      reciprocityRatio: true,
      trend: true,
    },
  })

  const map = new Map<string, CommStatsForScoring>()
  for (const s of stats) {
    if (s.contactId) {
      map.set(s.contactId, {
        totalMessages: s.totalMessages,
        avgMessagesPerWeek: s.avgMessagesPerWeek,
        last30DayCount: s.last30DayCount,
        last90DayCount: s.last90DayCount,
        lastMessageDate: s.lastMessageDate,
        reciprocityRatio: s.reciprocityRatio,
        trend: s.trend,
      })
    }
  }
  return map
}

/**
 * Compute a communication score (0-10) from text message stats.
 * Used for ring suggestions.
 */
export function computeCommScore(stats: CommStatsForScoring): number {
  const last30 = stats.last30DayCount || 0
  const last90 = stats.last90DayCount || 0
  const total = stats.totalMessages || 0
  const trend = stats.trend || 'stable'

  const recentActivity = Math.min(last30 / 30, 1.0) * 4    // 0–4 pts
  const consistency = Math.min(last90 / 60, 1.0) * 3        // 0–3 pts
  const volume = Math.min(total / 500, 1.0) * 2             // 0–2 pts
  const trendBonus = trend === 'growing' ? 1 : trend === 'fading' ? -1 : 0

  return Math.max(0, Math.min(10, recentActivity + consistency + volume + trendBonus))
}

/**
 * Suggest a ring based on communication score.
 */
export function computeSuggestedRing(commScore: number): string {
  if (commScore >= 7) return 'close'
  if (commScore >= 4) return 'regular'
  if (commScore >= 1) return 'outer'
  return 'new'
}

/**
 * Funnel stage ordering (lower index = earlier stage).
 */
const FUNNEL_STAGE_ORDER = [
  'new_acquaintance',
  'party_contact',
  'happy_hour',
  'dinner',
  'close_friend',
]

/**
 * Compute a suggested funnel stage based on event attendance and comm score.
 * Returns null if no promotion is warranted.
 *
 * Rules:
 * - Attended any party/activity → suggest party_contact
 * - Attended happy_hour → suggest happy_hour
 * - Attended dinner → suggest dinner
 * - dinner stage + commScore >= 7 → suggest close_friend
 * - Only suggest if earned stage > current stage
 */
export function computeSuggestedFunnelStage(
  currentStage: string | null,
  eventAttendances: Array<{ eventType: string; status: string }>,
  commScore: number,
): string | null {
  const currentIdx = FUNNEL_STAGE_ORDER.indexOf(currentStage || '')

  // Find highest earned stage from event attendance
  let earnedIdx = -1

  for (const att of eventAttendances) {
    if (att.status !== 'attended' && att.status !== 'confirmed') continue

    const et = att.eventType
    if (et === 'party' || et === 'activity' || et === 'game_night') {
      earnedIdx = Math.max(earnedIdx, FUNNEL_STAGE_ORDER.indexOf('party_contact'))
    } else if (et === 'happy_hour' || et === 'drinks' || et === 'bar') {
      earnedIdx = Math.max(earnedIdx, FUNNEL_STAGE_ORDER.indexOf('happy_hour'))
    } else if (et === 'dinner' || et === 'brunch') {
      earnedIdx = Math.max(earnedIdx, FUNNEL_STAGE_ORDER.indexOf('dinner'))
    }
  }

  // dinner stage + high comm score → close_friend
  if ((currentIdx >= FUNNEL_STAGE_ORDER.indexOf('dinner') || earnedIdx >= FUNNEL_STAGE_ORDER.indexOf('dinner'))
      && commScore >= 7) {
    earnedIdx = Math.max(earnedIdx, FUNNEL_STAGE_ORDER.indexOf('close_friend'))
  }

  // Only suggest if earned > current
  if (earnedIdx > currentIdx) {
    return FUNNEL_STAGE_ORDER[earnedIdx]
  }

  return null
}
