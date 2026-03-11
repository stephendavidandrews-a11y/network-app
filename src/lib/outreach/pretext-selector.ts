import { PrismaClient } from '@prisma/client'

interface RoleTransition {
  current_role: string
  current_role_label: string
  current_role_ends: string
  next_role: string
  next_role_label: string
  next_role_starts: string
  transition_announced: boolean
}

interface PretextResult {
  id: string
  pretextType: string
  hook: string
  strength: string
  validFrom: string | null
  validUntil: string | null
  used: boolean
}

interface GatingResult {
  proceed: boolean
  pretext?: PretextResult | null
  reason?: string
  redirectContactId?: string
  redirectContactName?: string
}

export async function getCurrentRole(prisma: PrismaClient): Promise<RoleTransition | null> {
  const setting = await prisma.appSetting.findUnique({ where: { key: 'role_transition' } })
  if (!setting) return null
  try {
    return JSON.parse(setting.value) as RoleTransition
  } catch {
    return null
  }
}

export async function getBestPretext(contactId: string, prisma: PrismaClient): Promise<PretextResult | null> {
  const today = new Date().toISOString().split('T')[0]

  const pretexts = await prisma.contactPretext.findMany({
    where: {
      contactId,
      used: false,
    },
  })

  // Filter by validity dates
  const valid = pretexts.filter(p => {
    if (p.validFrom && p.validFrom > today) return false
    if (p.validUntil && p.validUntil < today) return false
    return true
  })

  // Sort by type x strength priority
  const typeOrder: Record<string, number> = {
    signal_based: 4, event_based: 3, comment_based: 3,
    role_based: 2, content_based: 1, commitment_based: 1,
  }
  const strengthOrder: Record<string, number> = { strong: 3, medium: 2, weak: 1 }

  valid.sort((a, b) => {
    const scoreA = (typeOrder[a.pretextType] || 1) * (strengthOrder[a.strength] || 1)
    const scoreB = (typeOrder[b.pretextType] || 1) * (strengthOrder[b.strength] || 1)
    return scoreB - scoreA
  })

  return valid[0] || null
}

export async function shouldGenerateOutreach(
  contact: {
    id: string
    outreachMode: string
    accessibility: string
    outreachTiming: string | null
    organization: string | null
  },
  prisma: PrismaClient
): Promise<GatingResult> {
  const role = await getCurrentRole(prisma)
  const currentRole = role?.current_role || 'hawley_gc'

  // Gate 1: Pathway contacts never get direct outreach
  if (contact.outreachMode === 'pathway') {
    return {
      proceed: false,
      reason: 'Pathway target \u2014 no direct outreach. Build pathway evidence instead.',
    }
  }

  // Gate 2: Org-entry contacts \u2014 redirect to working-level contact
  if (contact.outreachMode === 'org-entry') {
    if (contact.organization) {
      const orgContacts = await prisma.contact.findMany({
        where: {
          organization: contact.organization,
          outreachMode: 'direct',
          id: { not: contact.id },
        },
        orderBy: { relationshipStrength: 'desc' },
        take: 1,
      })
      if (orgContacts.length > 0) {
        return {
          proceed: false,
          reason: `Org-entry target. Redirect outreach through ${orgContacts[0].name} at ${contact.organization}.`,
          redirectContactId: orgContacts[0].id,
          redirectContactName: orgContacts[0].name,
        }
      }
    }
    return {
      proceed: false,
      reason: 'Org-entry target \u2014 no direct contacts at this org found. Consider identifying their government affairs lead.',
    }
  }

  // Gate 3: Timing checks
  if (contact.outreachTiming === 'wait_cftc' && currentRole === 'hawley_gc') {
    return { proceed: false, reason: 'Deferred until CFTC role begins (March 30, 2026).' }
  }

  if (contact.outreachTiming === 'now_hawley' && currentRole !== 'hawley_gc') {
    const cftcPretext = await getBestPretext(contact.id, prisma)
    if (!cftcPretext) {
      return { proceed: false, reason: 'Hawley window has closed and no CFTC pretext available.' }
    }
  }

  // Gate 4: Get best pretext
  const bestPretext = await getBestPretext(contact.id, prisma)

  // Gate 5: Low accessibility + direct = flag for review
  if (contact.accessibility === 'low' && contact.outreachMode === 'direct') {
    return {
      proceed: true,
      pretext: bestPretext,
      reason: 'Low accessibility \u2014 outreach may not reach this person. Consider pathway approach.',
    }
  }

  return { proceed: true, pretext: bestPretext }
}
