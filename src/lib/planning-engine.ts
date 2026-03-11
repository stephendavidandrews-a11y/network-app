/**
 * Social Planning Engine
 *
 * Generates social event plans (happy hours, golf, dinners, parties)
 * by scoring candidates, selecting diverse groups, and matching venues.
 *
 * DC metro area filter applied by default — only local contacts considered.
 */

import { prisma } from './db'
import { daysSinceLastContact, getLastMessageDates, getCommStatsMap, computeCommScore } from './contact-activity'

// ─── Types ───────────────────────────────────────────────────────────

export interface CandidateScore {
  contactId: string
  name: string
  phone: string | null
  ring: string
  funnelStage: string | null
  totalScore: number
  breakdown: {
    overdueScore: number
    hookScore: number
    circleDiversity: number
    funnelBonus: number
    reciprocityWeight: number
    locationConvenience: number
    interestMatch: number
  }
  hooks: string[]
  recentDeclines: number
}

export interface PlanConfig {
  planType: 'happy_hour' | 'golf' | 'dinner' | 'party'
  targetDate: string
  targetSize: { min: number; max: number }
  weights: {
    overdue: number
    hook: number
    diversity: number
    funnel: number
    reciprocity: number
    location: number
    interest: number
  }
  filters?: {
    funnelStageMin?: string
    rings?: string[]
    excludeContactIds?: string[]
    interests?: string[]
    skipLocationFilter?: boolean
  }
}

export interface SuggestedContact {
  contactId: string
  name: string
  phone: string | null
  ring: string
  funnelStage: string | null
  score: number
  reasoning: string
  hooks: string[]
  draftText?: string
  voiceSource?: string
  sentAt?: string
  responseStatus?: string  // accepted / declined / maybe / pending
}

interface VenueResult {
  primary: { id: string; name: string; venueType: string; city: string | null } | null
  alternatives: Array<{ id: string; name: string; venueType: string; city: string | null }>
}

// ─── Constants ───────────────────────────────────────────────────────

const FUNNEL_STAGE_ORDER = [
  'new_acquaintance',
  'party_contact',
  'happy_hour',
  'dinner',
  'close_friend',
]

/** Cities in the DC/MD/VA metro area (lowercase for matching) */
const DC_METRO_CITIES = new Set([
  'washington', 'washington dc', 'washington, dc', 'dc',
  'arlington', 'alexandria', 'mclean', 'falls church', 'fairfax',
  'vienna', 'reston', 'herndon', 'tysons', 'tysons corner',
  'springfield', 'manassas', 'woodbridge', 'annandale', 'burke',
  'centreville', 'chantilly', 'leesburg', 'lorton', 'oakton',
  'fairfax station', 'clifton', 'sterling',
  'bethesda', 'silver spring', 'rockville', 'college park',
  'annapolis', 'bowie', 'laurel', 'gaithersburg', 'frederick',
  'potomac', 'oxon hill', 'fort washington', 'upper marlboro',
  'landover', 'mitchellville', 'ashton', 'clarksburg', 'derwood',
  'laytonsville', 'poolesville', 'mount airy',
])

const PLAN_TYPE_VENUE_MAP: Record<string, string[]> = {
  happy_hour: ['bar', 'rooftop_bar', 'beer_garden'],
  golf: ['golf_course'],
  dinner: ['restaurant'],
  party: ['bar', 'restaurant', 'rooftop_bar', 'beer_garden', 'activity'],
}

const DEFAULT_WEIGHTS: Record<string, PlanConfig['weights']> = {
  happy_hour: { overdue: 0.35, hook: 0.20, diversity: 0.15, funnel: 0.15, reciprocity: 0.10, location: 0.05, interest: 0 },
  golf:       { overdue: 0.20, hook: 0.10, diversity: 0.05, funnel: 0.05, reciprocity: 0.10, location: 0.05, interest: 0.45 },
  dinner:     { overdue: 0.30, hook: 0.25, diversity: 0.10, funnel: 0.10, reciprocity: 0.10, location: 0.05, interest: 0.10 },
  party:      { overdue: 0.15, hook: 0.10, diversity: 0.30, funnel: 0.10, reciprocity: 0.15, location: 0.10, interest: 0.10 },
}

// ─── Location Filter ─────────────────────────────────────────────────

function isInDCMetro(city: string | null): boolean {
  if (!city) return true // include contacts with no city (might be local)
  const normalized = city.trim().toLowerCase()
  // Check exact match
  if (DC_METRO_CITIES.has(normalized)) return true
  // Check if it contains a known DC-area name (handles "Washington, DC" etc.)
  const dcCities = Array.from(DC_METRO_CITIES)
  for (let i = 0; i < dcCities.length; i++) {
    if (normalized.includes(dcCities[i])) return true
  }
  // Also include any Virginia city (VA in the string)
  if (normalized.includes(', va') || normalized.includes(' va') || normalized.endsWith(' va')) return true
  return false
}

// ─── Candidate Scoring ───────────────────────────────────────────────

export async function scoreCandidates(config: PlanConfig): Promise<CandidateScore[]> {
  // Fetch all personal/both contacts
  const contacts = await prisma.contact.findMany({
    where: { contactType: { in: ['personal', 'both'] } },
    select: {
      id: true, name: true, phone: true, city: true,
      personalRing: true, funnelStage: true,
      personalCadenceDays: true, lastInteractionDate: true,
      reciprocityPattern: true,
    },
  })

  // Apply DC metro filter (unless skipped)
  const filtered = config.filters?.skipLocationFilter
    ? contacts
    : contacts.filter(c => isInDCMetro(c.city))

  // Apply exclusions
  const excludeSet = new Set(config.filters?.excludeContactIds || [])
  const eligible = filtered.filter(c => !excludeSet.has(c.id))

  if (eligible.length === 0) return []

  const contactIds = eligible.map(c => c.id)

  // Bulk fetch enrichment data
  const [lastMsgDates, commStatsMap] = await Promise.all([
    getLastMessageDates(contactIds),
    getCommStatsMap(contactIds),
  ])

  // Fetch interests/activities for hook scoring
  const profiles = await prisma.textExtractionProfile.findMany({
    where: { contactId: { in: contactIds }, extractionType: 'factual' },
    select: { contactId: true, interests: true, activities: true },
  })
  const interestMap = new Map<string, { interests: string[]; activities: string[] }>()
  for (const p of profiles) {
    try {
      const interests = JSON.parse(p.interests || '[]') as Array<{ interest: string; confidence: string }>
      const activities = JSON.parse(p.activities || '[]') as Array<{ activity: string; frequency: string }>
      interestMap.set(p.contactId, {
        interests: interests.map(i => i.interest.toLowerCase()),
        activities: activities.map(a => a.activity.toLowerCase()),
      })
    } catch {
      // skip malformed JSON
    }
  }

  // Fetch upcoming life events for hooks
  const today = new Date().toISOString().split('T')[0]
  const twoWeeksOut = new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0]
  const lifeEvents = await prisma.lifeEvent.findMany({
    where: {
      contactId: { in: contactIds },
      eventDate: { not: null },
    },
    select: { contactId: true, description: true, eventDate: true, recurring: true },
  })

  const lifeEventMap = new Map<string, string[]>()
  for (const e of lifeEvents) {
    if (!e.contactId || !e.eventDate) continue
    // Check if event is upcoming (within 14 days, accounting for recurring)
    let isUpcoming = false
    if (e.recurring) {
      const eventMonth = parseInt(e.eventDate.slice(5, 7))
      const eventDay = parseInt(e.eventDate.slice(8, 10))
      const now = new Date()
      for (let d = 0; d < 14; d++) {
        const check = new Date(now.getTime() + d * 86400000)
        if (check.getMonth() + 1 === eventMonth && check.getDate() === eventDay) {
          isUpcoming = true
          break
        }
      }
    } else {
      isUpcoming = e.eventDate >= today && e.eventDate <= twoWeeksOut
    }
    if (isUpcoming) {
      if (!lifeEventMap.has(e.contactId)) lifeEventMap.set(e.contactId, [])
      lifeEventMap.get(e.contactId)!.push(e.description)
    }
  }

  // Fetch personal group memberships for diversity scoring
  const groupMemberships = await prisma.personalGroupMember.findMany({
    where: { contactId: { in: contactIds } },
    select: { contactId: true, groupId: true },
  })
  const contactGroups = new Map<string, string[]>()
  for (const m of groupMemberships) {
    if (!contactGroups.has(m.contactId)) contactGroups.set(m.contactId, [])
    contactGroups.get(m.contactId)!.push(m.groupId)
  }

  // Apply funnel stage filter
  const funnelMin = config.filters?.funnelStageMin
  const funnelMinIdx = funnelMin ? FUNNEL_STAGE_ORDER.indexOf(funnelMin) : -1

  // Score each candidate
  const candidates: CandidateScore[] = []
  const requiredInterests = config.filters?.interests?.map(i => i.toLowerCase()) || []

  for (const c of eligible) {
    const ring = c.personalRing || 'new'
    const funnelStage = c.funnelStage || null
    const cadence = c.personalCadenceDays || 21

    // Funnel stage filter
    if (funnelMinIdx >= 0) {
      const contactFunnelIdx = FUNNEL_STAGE_ORDER.indexOf(funnelStage || '')
      if (contactFunnelIdx < funnelMinIdx) continue
    }

    // Ring filter
    if (config.filters?.rings && !config.filters.rings.includes(ring)) continue

    const stats = commStatsMap.get(c.id)
    const lastMsgDate = lastMsgDates.get(c.id) || null
    const days = daysSinceLastContact(c.lastInteractionDate, lastMsgDate)

    // --- Overdue score (0-1) ---
    let overdueScore = 0
    if (days === null) {
      overdueScore = 1.0 // never contacted = max overdue
    } else {
      overdueScore = Math.min(days / cadence, 2.0) / 2.0 // cap at 2x overdue
    }

    // --- Hook score (0-1) ---
    const hooks: string[] = []
    const contactLifeEvents = lifeEventMap.get(c.id) || []
    for (const desc of contactLifeEvents) {
      hooks.push(desc)
    }
    const contactInterests = interestMap.get(c.id)
    if (contactInterests) {
      // Add shared high-value interests as hooks
      const interesting = contactInterests.interests.slice(0, 3)
      for (const int of interesting) {
        if (!hooks.some(h => h.toLowerCase().includes(int))) {
          hooks.push(int)
        }
      }
    }
    const hookScore = Math.min(hooks.length / 3, 1.0)

    // --- Interest match score (0-1, for golf etc.) ---
    let interestMatch = 0
    if (requiredInterests.length > 0 && contactInterests) {
      const matched = requiredInterests.filter(ri =>
        contactInterests.interests.some(ci => ci.includes(ri)) ||
        contactInterests.activities.some(ca => ca.includes(ri))
      )
      interestMatch = matched.length / requiredInterests.length
      // If required interest and no match, skip this candidate
      if (interestMatch === 0) continue
    }

    // --- Circle diversity (0-1, will be refined during group selection) ---
    const groups = contactGroups.get(c.id) || []
    const circleDiversity = Math.min(groups.length / 3, 1.0) * 0.5 +
      (ring === 'close' ? 0.5 : ring === 'regular' ? 0.3 : ring === 'outer' ? 0.2 : 0.1)

    // --- Funnel bonus (0-1) ---
    const funnelIdx = FUNNEL_STAGE_ORDER.indexOf(funnelStage || '')
    const funnelBonus = Math.max(0, funnelIdx) / (FUNNEL_STAGE_ORDER.length - 1)

    // --- Reciprocity weight (0-1) ---
    const recipPattern = c.reciprocityPattern || 'unknown'
    const reciprocityWeight = recipPattern === 'mutual' ? 1.0
      : recipPattern === 'i_initiate' ? 0.6
      : recipPattern === 'they_initiate' ? 0.8
      : 0.5 // unknown

    // --- Location convenience (0-1) ---
    let locationConvenience = 0.5 // default for no city
    if (c.city) {
      const normalized = c.city.trim().toLowerCase()
      if (normalized.includes('washington') || normalized === 'dc') {
        locationConvenience = 1.0
      } else if (normalized.includes('arlington') || normalized.includes('alexandria') ||
                 normalized.includes('bethesda') || normalized.includes('silver spring')) {
        locationConvenience = 0.9
      } else if (isInDCMetro(c.city)) {
        locationConvenience = 0.7
      } else {
        locationConvenience = 0.2
      }
    }

    // --- Total score ---
    const w = config.weights
    const totalScore =
      overdueScore * w.overdue +
      hookScore * w.hook +
      circleDiversity * w.diversity +
      funnelBonus * w.funnel +
      reciprocityWeight * w.reciprocity +
      locationConvenience * w.location +
      interestMatch * w.interest

    candidates.push({
      contactId: c.id,
      name: c.name,
      phone: c.phone,
      ring,
      funnelStage,
      totalScore: Math.round(totalScore * 1000) / 1000,
      breakdown: {
        overdueScore: Math.round(overdueScore * 100) / 100,
        hookScore: Math.round(hookScore * 100) / 100,
        circleDiversity: Math.round(circleDiversity * 100) / 100,
        funnelBonus: Math.round(funnelBonus * 100) / 100,
        reciprocityWeight: Math.round(reciprocityWeight * 100) / 100,
        locationConvenience: Math.round(locationConvenience * 100) / 100,
        interestMatch: Math.round(interestMatch * 100) / 100,
      },
      hooks,
      recentDeclines: 0, // TODO: track from response data
    })
  }

  // Sort by total score descending
  candidates.sort((a, b) => b.totalScore - a.totalScore)
  return candidates
}

// ─── Group Selection ─────────────────────────────────────────────────

export function selectGroup(
  candidates: CandidateScore[],
  config: PlanConfig,
): CandidateScore[] {
  if (candidates.length === 0) return []

  const { min, max } = config.targetSize
  if (candidates.length <= min) return candidates.slice()

  // Greedy selection maximizing score + diversity
  const selected: CandidateScore[] = [candidates[0]]
  const selectedRings = new Set([candidates[0].ring])

  for (let i = 1; i < candidates.length && selected.length < max; i++) {
    const c = candidates[i]

    // Diversity bonus for different rings
    const ringBonus = selectedRings.has(c.ring) ? 0 : 0.05
    const adjustedScore = c.totalScore + ringBonus

    // Accept if adjusted score is reasonable (top 2x of target size)
    if (selected.length < min || adjustedScore > candidates[0].totalScore * 0.3) {
      selected.push(c)
      selectedRings.add(c.ring)
    }
  }

  return selected.slice(0, max)
}

// ─── Venue Selection ─────────────────────────────────────────────────

export async function selectVenue(
  planType: string,
  _contactIds: string[],
): Promise<VenueResult> {
  const venueTypes = PLAN_TYPE_VENUE_MAP[planType] || ['bar']

  const venues = await prisma.personalVenue.findMany({
    where: { venueType: { in: venueTypes } },
    select: { id: true, name: true, venueType: true, city: true },
  })

  if (venues.length === 0) {
    return { primary: null, alternatives: [] }
  }

  // Prefer DC venues, then shuffle for variety
  const dcVenues = venues.filter(v => v.city && v.city.toLowerCase().includes('washington'))
  const otherVenues = venues.filter(v => !v.city || !v.city.toLowerCase().includes('washington'))

  // Random selection from DC venues first
  const shuffled = [...dcVenues.sort(() => Math.random() - 0.5), ...otherVenues.sort(() => Math.random() - 0.5)]

  return {
    primary: shuffled[0] || null,
    alternatives: shuffled.slice(1, 3),
  }
}

// ─── Reasoning Generation ────────────────────────────────────────────

export function generateGroupReasoning(
  selected: CandidateScore[],
  planType: string,
): string {
  if (selected.length === 0) return 'No candidates found.'

  const ringCounts: Record<string, number> = {}
  for (const c of selected) {
    ringCounts[c.ring] = (ringCounts[c.ring] || 0) + 1
  }

  const parts: string[] = []

  // Group composition
  const ringDesc = Object.entries(ringCounts)
    .map(([ring, count]) => `${count} ${ring}`)
    .join(', ')
  parts.push(`Group of ${selected.length} (${ringDesc}).`)

  // Top reasons
  const overdueContacts = selected.filter(c => c.breakdown.overdueScore > 0.7)
  if (overdueContacts.length > 0) {
    parts.push(`${overdueContacts.length} overdue for contact.`)
  }

  const withHooks = selected.filter(c => c.hooks.length > 0)
  if (withHooks.length > 0) {
    parts.push(`${withHooks.length} have conversation hooks.`)
  }

  // Plan type note
  if (planType === 'golf') {
    parts.push('All share golf interest.')
  } else if (planType === 'dinner') {
    parts.push('Mix chosen for good dinner conversation.')
  } else if (planType === 'party') {
    parts.push('Diverse mix across social circles.')
  }

  return parts.join(' ')
}

// ─── Plan Generators ─────────────────────────────────────────────────

export async function generateHappyHourPlan(targetDate: string) {
  const config: PlanConfig = {
    planType: 'happy_hour',
    targetDate,
    targetSize: { min: 3, max: 6 },
    weights: DEFAULT_WEIGHTS.happy_hour,
    filters: { funnelStageMin: 'party_contact' },
  }

  const candidates = await scoreCandidates(config)
  const selected = selectGroup(candidates, config)
  const venue = await selectVenue('happy_hour', selected.map(c => c.contactId))
  const reasoning = generateGroupReasoning(selected, 'happy_hour')

  const suggestedContacts: SuggestedContact[] = selected.map(c => ({
    contactId: c.contactId,
    name: c.name,
    phone: c.phone,
    ring: c.ring,
    funnelStage: c.funnelStage,
    score: c.totalScore,
    reasoning: buildContactReasoning(c),
    hooks: c.hooks,
  }))

  const plan = await prisma.socialPlan.create({
    data: {
      planType: 'happy_hour',
      targetDate,
      suggestedContacts: JSON.stringify(suggestedContacts),
      suggestedVenueId: venue.primary?.id || null,
      alternativeVenueIds: JSON.stringify(venue.alternatives.map(v => v.id)),
      groupReasoning: reasoning,
      status: 'pending',
    },
  })

  return {
    plan,
    suggestedContacts,
    venue,
    reasoning,
    totalCandidatesScored: candidates.length,
  }
}

export async function generateGolfPlan(targetDate: string) {
  // Season check: March-November
  const month = parseInt(targetDate.slice(5, 7))
  if (month < 3 || month > 11) {
    return { plan: null, error: 'Golf season is March through November.' }
  }

  const config: PlanConfig = {
    planType: 'golf',
    targetDate,
    targetSize: { min: 3, max: 4 },
    weights: DEFAULT_WEIGHTS.golf,
    filters: { interests: ['golf'] },
  }

  const candidates = await scoreCandidates(config)
  if (candidates.length < 3) {
    return { plan: null, error: `Only ${candidates.length} golfers found in DC area. Need at least 3.` }
  }

  const selected = selectGroup(candidates, config)
  const venue = await selectVenue('golf', selected.map(c => c.contactId))
  const reasoning = generateGroupReasoning(selected, 'golf')

  const suggestedContacts: SuggestedContact[] = selected.map(c => ({
    contactId: c.contactId,
    name: c.name,
    phone: c.phone,
    ring: c.ring,
    funnelStage: c.funnelStage,
    score: c.totalScore,
    reasoning: buildContactReasoning(c),
    hooks: c.hooks,
  }))

  const plan = await prisma.socialPlan.create({
    data: {
      planType: 'golf',
      targetDate,
      suggestedContacts: JSON.stringify(suggestedContacts),
      suggestedVenueId: venue.primary?.id || null,
      alternativeVenueIds: JSON.stringify(venue.alternatives.map(v => v.id)),
      groupReasoning: reasoning,
      status: 'pending',
    },
  })

  return { plan, suggestedContacts, venue, reasoning, totalCandidatesScored: candidates.length }
}

export async function generateDinnerPlan(targetDate: string) {
  const config: PlanConfig = {
    planType: 'dinner',
    targetDate,
    targetSize: { min: 4, max: 8 },
    weights: DEFAULT_WEIGHTS.dinner,
    filters: { funnelStageMin: 'happy_hour' },
  }

  const candidates = await scoreCandidates(config)
  const selected = selectGroup(candidates, config)
  const venue = await selectVenue('dinner', selected.map(c => c.contactId))
  const reasoning = generateGroupReasoning(selected, 'dinner')

  const suggestedContacts: SuggestedContact[] = selected.map(c => ({
    contactId: c.contactId,
    name: c.name,
    phone: c.phone,
    ring: c.ring,
    funnelStage: c.funnelStage,
    score: c.totalScore,
    reasoning: buildContactReasoning(c),
    hooks: c.hooks,
  }))

  const plan = await prisma.socialPlan.create({
    data: {
      planType: 'dinner',
      targetDate,
      suggestedContacts: JSON.stringify(suggestedContacts),
      suggestedVenueId: venue.primary?.id || null,
      alternativeVenueIds: JSON.stringify(venue.alternatives.map(v => v.id)),
      groupReasoning: reasoning,
      status: 'pending',
    },
  })

  return { plan, suggestedContacts, venue, reasoning, totalCandidatesScored: candidates.length }
}

export async function generatePartyPlan(targetDate: string) {
  const config: PlanConfig = {
    planType: 'party',
    targetDate,
    targetSize: { min: 10, max: 25 },
    weights: DEFAULT_WEIGHTS.party,
  }

  const candidates = await scoreCandidates(config)
  const selected = selectGroup(candidates, config)
  const venue = await selectVenue('party', selected.map(c => c.contactId))
  const reasoning = generateGroupReasoning(selected, 'party')

  const suggestedContacts: SuggestedContact[] = selected.map(c => ({
    contactId: c.contactId,
    name: c.name,
    phone: c.phone,
    ring: c.ring,
    funnelStage: c.funnelStage,
    score: c.totalScore,
    reasoning: buildContactReasoning(c),
    hooks: c.hooks,
  }))

  const plan = await prisma.socialPlan.create({
    data: {
      planType: 'party',
      targetDate,
      suggestedContacts: JSON.stringify(suggestedContacts),
      suggestedVenueId: venue.primary?.id || null,
      alternativeVenueIds: JSON.stringify(venue.alternatives.map(v => v.id)),
      groupReasoning: reasoning,
      status: 'pending',
    },
  })

  return { plan, suggestedContacts, venue, reasoning, totalCandidatesScored: candidates.length }
}

// ─── Helpers ─────────────────────────────────────────────────────────

function buildContactReasoning(c: CandidateScore): string {
  const parts: string[] = []
  if (c.breakdown.overdueScore > 0.7) parts.push('overdue for contact')
  if (c.breakdown.hookScore > 0.5) parts.push(`hooks: ${c.hooks.slice(0, 2).join(', ')}`)
  if (c.breakdown.interestMatch > 0) parts.push('interest match')
  if (c.breakdown.reciprocityWeight >= 0.8) parts.push('strong mutual communication')
  if (parts.length === 0) parts.push('good overall fit')
  return parts.join('; ')
}

/** Generate plan by type — dispatcher */
export async function generatePlan(planType: string, targetDate: string) {
  switch (planType) {
    case 'happy_hour': return generateHappyHourPlan(targetDate)
    case 'golf': return generateGolfPlan(targetDate)
    case 'dinner': return generateDinnerPlan(targetDate)
    case 'party': return generatePartyPlan(targetDate)
    default:
      throw new Error(`Unknown plan type: ${planType}`)
  }
}
