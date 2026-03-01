/**
 * Contact Matching for Ingestion Pipeline
 *
 * Matches ingested content to existing contacts via:
 * 1. Exact email match
 * 2. Exact phone match
 * 3. Fuzzy name + org match
 * 4. Reverse lookup against recent stubs (contacts created from prior ingestion)
 */

import { prisma } from '@/lib/db'

interface MatchResult {
  contactId: string | null
  contactName: string | null
  contactOrg: string | null
  contactTier: number | null
  matchMethod: 'email' | 'phone' | 'name_org' | 'name_fuzzy' | 'hint_parse' | null
  confidence: 'high' | 'medium' | 'low'
}

/**
 * Normalize a name for fuzzy matching:
 * strip titles, lowercase, remove non-alpha chars
 */
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(jr|sr|dr|mr|mrs|ms|esq|phd|md|ii|iii|iv)\b\.?/gi, '')
    .replace(/[^a-z\s]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
}

/**
 * Check if two names are a plausible match.
 * Handles partial names ("Jerry" matches "Jerry Smith"),
 * reversed order ("Smith, Jerry" matches "Jerry Smith"),
 * and common abbreviations.
 */
function namesMatch(a: string, b: string): boolean {
  const na = normalizeName(a)
  const nb = normalizeName(b)

  if (!na || !nb) return false

  // Exact match after normalization
  if (na === nb) return true

  const partsA = na.split(' ')
  const partsB = nb.split(' ')

  // One is a single name (first name only) — check if it's the first part of the other
  if (partsA.length === 1) {
    return partsB[0] === partsA[0]
  }
  if (partsB.length === 1) {
    return partsA[0] === partsB[0]
  }

  // Reversed order: "Smith Jerry" matches "Jerry Smith"
  if (partsA.length === 2 && partsB.length === 2) {
    if (partsA[0] === partsB[1] && partsA[1] === partsB[0]) return true
  }

  // First + last match (ignoring middle names)
  if (partsA[0] === partsB[0] && partsA[partsA.length - 1] === partsB[partsB.length - 1]) {
    return true
  }

  return false
}

/**
 * Normalize phone number for matching: strip everything except digits
 */
function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  // Handle US numbers: if 11 digits starting with 1, strip leading 1
  if (digits.length === 11 && digits.startsWith('1')) {
    return digits.slice(1)
  }
  return digits
}

/**
 * Match a contact hint (name, email, or phone) against the database.
 */
export async function matchContact(hint?: string, metadata?: {
  originalFrom?: string
  originalTo?: string
  signature?: {
    name?: string
    email?: string
    phone?: string
    org?: string
  }
}): Promise<MatchResult> {
  const noMatch: MatchResult = {
    contactId: null,
    contactName: null,
    contactOrg: null,
    contactTier: null,
    matchMethod: null,
    confidence: 'low',
  }

  // Collect all possible identifiers from hint + metadata
  const emails: string[] = []
  const phones: string[] = []
  const names: string[] = []
  const orgs: string[] = []

  // Parse hint — could be email, phone, or name
  if (hint) {
    const trimmed = hint.trim()
    if (trimmed.includes('@')) {
      emails.push(trimmed.toLowerCase())
    } else if (/^[\d\s\-\+\(\)]+$/.test(trimmed) && trimmed.replace(/\D/g, '').length >= 7) {
      phones.push(normalizePhone(trimmed))
    } else {
      names.push(trimmed)
    }
  }

  // Extract from metadata
  if (metadata?.originalFrom) {
    const emailMatch = metadata.originalFrom.match(/<([^>]+@[^>]+)>/)
    if (emailMatch) {
      emails.push(emailMatch[1].toLowerCase())
    } else if (metadata.originalFrom.includes('@')) {
      emails.push(metadata.originalFrom.trim().toLowerCase())
    }
    // Also try to extract name from "Name <email>" format
    const nameMatch = metadata.originalFrom.match(/^([^<]+)</)
    if (nameMatch) {
      names.push(nameMatch[1].trim())
    }
  }

  if (metadata?.signature?.email) {
    emails.push(metadata.signature.email.toLowerCase())
  }
  if (metadata?.signature?.phone) {
    phones.push(normalizePhone(metadata.signature.phone))
  }
  if (metadata?.signature?.name) {
    names.push(metadata.signature.name)
  }
  if (metadata?.signature?.org) {
    orgs.push(metadata.signature.org)
  }

  // 1. Try exact email match (highest confidence)
  for (const email of emails) {
    const contact = await prisma.contact.findFirst({
      where: { email: { equals: email } },
      select: { id: true, name: true, organization: true, tier: true },
    })
    if (contact) {
      return {
        contactId: contact.id,
        contactName: contact.name,
        contactOrg: contact.organization,
        contactTier: contact.tier,
        matchMethod: 'email',
        confidence: 'high',
      }
    }
  }

  // 2. Try phone match
  for (const phone of phones) {
    if (phone.length < 7) continue
    const contacts = await prisma.contact.findMany({
      where: { phone: { not: null } },
      select: { id: true, name: true, organization: true, tier: true, phone: true },
    })
    const matched = contacts.find(c => c.phone && normalizePhone(c.phone) === phone)
    if (matched) {
      return {
        contactId: matched.id,
        contactName: matched.name,
        contactOrg: matched.organization,
        contactTier: matched.tier,
        matchMethod: 'phone',
        confidence: 'high',
      }
    }
  }

  // 3. Try name + org match (medium-high confidence)
  if (names.length > 0) {
    const allContacts = await prisma.contact.findMany({
      select: { id: true, name: true, organization: true, tier: true },
    })

    for (const name of names) {
      // First try name + org combo for higher confidence
      if (orgs.length > 0) {
        for (const org of orgs) {
          const matched = allContacts.find(c =>
            namesMatch(c.name, name) &&
            c.organization &&
            c.organization.toLowerCase().includes(org.toLowerCase())
          )
          if (matched) {
            return {
              contactId: matched.id,
              contactName: matched.name,
              contactOrg: matched.organization,
              contactTier: matched.tier,
              matchMethod: 'name_org',
              confidence: 'high',
            }
          }
        }
      }

      // Then try name-only match
      const nameMatches = allContacts.filter(c => namesMatch(c.name, name))
      if (nameMatches.length === 1) {
        return {
          contactId: nameMatches[0].id,
          contactName: nameMatches[0].name,
          contactOrg: nameMatches[0].organization,
          contactTier: nameMatches[0].tier,
          matchMethod: 'name_fuzzy',
          confidence: 'medium',
        }
      }
      // Multiple matches — ambiguous, pick highest tier
      if (nameMatches.length > 1) {
        const best = nameMatches.sort((a, b) => a.tier - b.tier)[0]
        return {
          contactId: best.id,
          contactName: best.name,
          contactOrg: best.organization,
          contactTier: best.tier,
          matchMethod: 'name_fuzzy',
          confidence: 'low',
        }
      }
    }
  }

  return noMatch
}

/**
 * Generate a content hash for dedup checking.
 * Simple: first 500 chars normalized + source.
 */
export function contentHash(content: string, source: string): string {
  const normalized = content
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500)

  // Simple hash — good enough for dedup
  let hash = 0
  const str = `${source}:${normalized}`
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32bit integer
  }
  return hash.toString(36)
}

/**
 * Check if content has already been ingested (dedup).
 */
export async function isDuplicate(hash: string, threadId?: string): Promise<boolean> {
  // Check by content hash
  const byHash = await prisma.ingestionItem.findFirst({
    where: { contentHash: hash },
    select: { id: true },
  })
  if (byHash) return true

  // Check by thread ID (iMessage dedup)
  if (threadId) {
    // For iMessage, check if we've ingested this thread recently (within 2 hours)
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
    const byThread = await prisma.ingestionItem.findFirst({
      where: {
        threadId,
        createdAt: { gte: twoHoursAgo },
      },
      select: { id: true },
    })
    if (byThread) return true
  }

  return false
}

/**
 * Detect if content is from a .gov address.
 */
export function isGovSensitive(metadata?: {
  originalFrom?: string
  forwardedFrom?: string
}): boolean {
  if (!metadata) return false
  const from = metadata.originalFrom || ''
  const forwarded = metadata.forwardedFrom || ''
  return from.includes('.gov') || forwarded.includes('.gov')
}
