/**
 * Nudge Engine — generates daily reach-out suggestions.
 *
 * Nudge types:
 * - overdue_reachout: contact past their cadence
 * - birthday: birthday within 3 days
 * - life_event: upcoming life event within 7 days
 * - dropped_ball: they texted, Stephen didn't reply
 * - fading_momentum: trend='fading' for close/regular ring contacts
 * - new_contact_followup: new contact (<30 days), no interaction in 7+ days
 */

import { prisma } from './db'
import { daysSinceLastContact, getLastMessageDates, getCommStatsMap } from './contact-activity'

interface NudgeCandidate {
  nudgeType: string
  contactId: string
  contactName: string
  reasoning: string
  suggestedAction: string
  urgency: number // 0-10, higher = more urgent
}

const MAX_DAILY_NUDGES = 5

export async function generateDailyNudges(): Promise<unknown[]> {
  const today = new Date().toISOString().split('T')[0]

  // Check if nudges already generated today
  const existingToday = await prisma.personalNudge.findMany({
    where: { scheduledFor: today, status: 'pending' },
  })
  if (existingToday.length > 0) {
    return existingToday
  }

  const contacts = await prisma.contact.findMany({
    where: { contactType: { in: ['personal', 'both'] } },
    select: {
      id: true, name: true, personalRing: true,
      personalCadenceDays: true, lastInteractionDate: true,
      createdAt: true,
    },
  })

  const contactIds = contacts.map(c => c.id)
  const [lastMsgDates, commStatsMap] = await Promise.all([
    getLastMessageDates(contactIds),
    getCommStatsMap(contactIds),
  ])

  const candidates: NudgeCandidate[] = []

  // ─── Overdue Reachout ─────────────────────────────
  for (const c of contacts) {
    const cadence = c.personalCadenceDays || 21
    const days = daysSinceLastContact(c.lastInteractionDate, lastMsgDates.get(c.id) || null)
    if (days !== null && days > cadence) {
      const overdueRatio = days / cadence
      candidates.push({
        nudgeType: 'overdue_reachout',
        contactId: c.id,
        contactName: c.name,
        reasoning: `${days} days since last contact (cadence: ${cadence}d)`,
        suggestedAction: `Text ${c.name} — ${Math.round(overdueRatio)}x overdue`,
        urgency: Math.min(overdueRatio * 3, 10),
      })
    }
  }

  // ─── Birthday ─────────────────────────────────────
  const lifeEvents = await prisma.lifeEvent.findMany({
    where: { recurring: true },
    include: { contact: { select: { id: true, name: true, contactType: true } } },
  })

  const now = new Date()
  for (const e of lifeEvents) {
    if (!e.contact || !['personal', 'both'].includes(e.contact.contactType)) continue
    if (!e.eventDate) continue

    const eventMonth = parseInt(e.eventDate.slice(5, 7))
    const eventDay = parseInt(e.eventDate.slice(8, 10))

    for (let d = 0; d <= 3; d++) {
      const check = new Date(now.getTime() + d * 86400000)
      if (check.getMonth() + 1 === eventMonth && check.getDate() === eventDay) {
        const isToday = d === 0
        candidates.push({
          nudgeType: 'birthday',
          contactId: e.contact.id,
          contactName: e.contact.name,
          reasoning: isToday ? `${e.contact.name}'s birthday is TODAY!` : `${e.contact.name}'s birthday is in ${d} days`,
          suggestedAction: `Send happy birthday text to ${e.contact.name}`,
          urgency: isToday ? 10 : 8 - d,
        })
        break
      }
    }
  }

  // ─── Fading Momentum ──────────────────────────────
  for (const c of contacts) {
    const ring = c.personalRing || 'new'
    if (ring !== 'close' && ring !== 'regular') continue

    const stats = commStatsMap.get(c.id)
    if (!stats) continue

    if (stats.trend === 'fading' && (stats.last90DayCount || 0) > 0) {
      candidates.push({
        nudgeType: 'fading_momentum',
        contactId: c.id,
        contactName: c.name,
        reasoning: `Communication trending down with ${ring} friend`,
        suggestedAction: `Reach out to ${c.name} — momentum fading`,
        urgency: ring === 'close' ? 7 : 5,
      })
    }
  }

  // ─── New Contact Followup ─────────────────────────
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString()
  for (const c of contacts) {
    if (!c.createdAt || c.createdAt < thirtyDaysAgo) continue

    const days = daysSinceLastContact(c.lastInteractionDate, lastMsgDates.get(c.id) || null)
    if (days !== null && days >= 7) {
      candidates.push({
        nudgeType: 'new_contact_followup',
        contactId: c.id,
        contactName: c.name,
        reasoning: `New contact added ${Math.round((Date.now() - new Date(c.createdAt).getTime()) / 86400000)}d ago, last contact ${days}d ago`,
        suggestedAction: `Follow up with new contact ${c.name}`,
        urgency: 4,
      })
    }
  }

  // ─── Deduplicate & Prioritize ─────────────────────
  // One nudge per contact, keep highest urgency
  const byContact = new Map<string, NudgeCandidate>()
  for (const n of candidates) {
    const existing = byContact.get(n.contactId)
    if (!existing || n.urgency > existing.urgency) {
      byContact.set(n.contactId, n)
    }
  }

  const sorted = Array.from(byContact.values())
    .sort((a, b) => b.urgency - a.urgency)
    .slice(0, MAX_DAILY_NUDGES)

  // Create PersonalNudge records
  const created = []
  for (const n of sorted) {
    const nudge = await prisma.personalNudge.create({
      data: {
        nudgeType: n.nudgeType,
        contactIds: JSON.stringify([n.contactId]),
        reasoning: n.reasoning,
        suggestedAction: n.suggestedAction,
        status: 'pending',
        scheduledFor: today,
      },
    })
    created.push({ ...nudge, contactName: n.contactName, urgency: n.urgency })
  }

  return created
}
