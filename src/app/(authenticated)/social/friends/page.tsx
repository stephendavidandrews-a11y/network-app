import { prisma } from '@/lib/db'
import { daysSinceLastContact, getCommStatsMap, computeCommScore, computeSuggestedRing, computeSuggestedFunnelStage } from '@/lib/contact-activity'
import { PersonalContactsContent } from '@/components/social/PersonalContactsContent'

export default async function FriendsPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined }
}) {
  const ring = typeof searchParams.ring === 'string' ? searchParams.ring : undefined
  const group = typeof searchParams.group === 'string' ? searchParams.group : undefined
  const overdue = searchParams.overdue === 'true'
  const search = typeof searchParams.search === 'string' ? searchParams.search : undefined
  const sort = typeof searchParams.sort === 'string' ? searchParams.sort : 'name'

  const where: Record<string, unknown> = {
    contactType: { in: ['personal', 'both'] },
  }
  if (ring) where.personalRing = ring

  let orderBy: Record<string, string> = { name: 'asc' }
  if (sort === 'last_contact') orderBy = { lastInteractionDate: 'asc' }
  if (sort === 'created') orderBy = { createdAt: 'desc' }

  const contacts = await prisma.contact.findMany({
    where,
    orderBy,
    include: {
      personalGroupMemberships: { include: { group: true } },
    },
  })

  let filtered = contacts
  if (group) {
    filtered = filtered.filter(c =>
      c.personalGroupMemberships.some(m => m.group.name === group || m.groupId === group)
    )
  }

  const commStatsMap = await getCommStatsMap(filtered.map(c => c.id))

  // Fetch plan attendances for funnel suggestions (unified model)
  const attendances = await prisma.socialPlanAttendee.findMany({
    where: { contactId: { in: filtered.map(c => c.id) } },
    include: { plan: { select: { planType: true } } },
  })
  const attendanceMap = new Map<string, Array<{ eventType: string; status: string }>>()
  for (const att of attendances) {
    if (!att.contactId) continue
    const list = attendanceMap.get(att.contactId) || []
    list.push({ eventType: att.plan.planType, status: att.status })
    attendanceMap.set(att.contactId, list)
  }

  const enriched = filtered.map(c => {
    const cadence = c.personalCadenceDays || 21
    const stats = commStatsMap.get(c.id)
    const lastMsgDate = stats?.lastMessageDate || null
    const daysSince = daysSinceLastContact(c.lastInteractionDate, lastMsgDate)
    const isOverdue = daysSince === null || daysSince > cadence

    // Ring suggestion
    const commScore = stats ? computeCommScore(stats) : 0
    const suggestedRing = computeSuggestedRing(commScore)
    const currentRing = c.personalRing || 'new'

    // Only show suggestion if it differs and wasn't dismissed in the last 90 days
    const dismissedAt = c.ringSuggestionDismissed
    const dismissedRecently = dismissedAt &&
      (Date.now() - new Date(dismissedAt).getTime()) < 90 * 24 * 60 * 60 * 1000
    const hasSuggestion = suggestedRing !== currentRing && !dismissedRecently

    // Funnel suggestion
    const contactAttendances = attendanceMap.get(c.id) || []
    const suggestedFunnel = computeSuggestedFunnelStage(c.funnelStage, contactAttendances, commScore)
    const funnelDismissedAt = c.funnelSuggestionDismissed
    const funnelDismissedRecently = funnelDismissedAt &&
      (Date.now() - new Date(funnelDismissedAt).getTime()) < 90 * 24 * 60 * 60 * 1000
    const hasFunnelSuggestion = suggestedFunnel && !funnelDismissedRecently

    return {
      id: c.id, name: c.name, phone: c.phone, email: c.email, photoUrl: c.photoUrl,
      contactType: c.contactType, personalRing: currentRing,
      personalCadenceDays: cadence, howWeMet: c.howWeMet, city: c.city,
      neighborhood: c.neighborhood, funnelStage: c.funnelStage,
      lastInteractionDate: c.lastInteractionDate, daysSinceInteraction: daysSince,
      isOverdue, groups: c.personalGroupMemberships.map(m => m.group.name), notes: c.notes,
      suggestedRing: hasSuggestion ? suggestedRing : null,
      suggestedFunnel: hasFunnelSuggestion ? suggestedFunnel : null,
      commScore: Math.round(commScore * 10) / 10,
    }
  })

  const final = overdue ? enriched.filter(c => c.isOverdue) : enriched
  const searched = search
    ? final.filter(c =>
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        (c.city || '').toLowerCase().includes(search.toLowerCase()) ||
        (c.howWeMet || '').toLowerCase().includes(search.toLowerCase())
      )
    : final

  const suggestionCount = enriched.filter(c => c.suggestedRing).length
  const funnelSuggestionCount = enriched.filter(c => c.suggestedFunnel).length

  const groups_list = await prisma.personalGroup.findMany({
    include: { members: true },
    orderBy: { name: 'asc' },
  })

  return (
    <PersonalContactsContent
      contacts={searched}
      groups={groups_list.map(g => ({ id: g.id, name: g.name, memberCount: g.members.length }))}
      filters={{ ring, group, overdue, search, sort }}
      suggestionCount={suggestionCount}
      funnelSuggestionCount={funnelSuggestionCount}
    />
  )
}
