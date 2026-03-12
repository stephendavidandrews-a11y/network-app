import { prisma } from "@/lib/db"

/**
 * syncPrimaryAffiliationToContact
 *
 * Syncs Contact.organization and Contact.title from the primary current affiliation.
 * isPrimary is a policy field, NOT a raw extracted fact.
 *
 * Decision tree:
 * 1. Exactly one current affiliation with isPrimary=true → sync flat fields
 * 2. No primary, exactly one current → auto-promote, sync flat fields
 * 3. No primary, multiple current → do NOT sync (ambiguous)
 * 4. Multiple primary → data integrity issue, do NOT sync
 */
export interface SyncResult {
  synced: boolean
  source?: "primary" | "auto_promoted"
  reason?: "ambiguous_no_primary" | "multiple_primary" | "no_current_affiliations"
  count?: number
}

export async function syncPrimaryAffiliationToContact(contactId: string): Promise<SyncResult> {
  const currentAffiliations = await prisma.contactAffiliation.findMany({
    where: { contactId, isCurrent: true },
    include: {
      organization: { select: { id: true, name: true } },
    },
  })

  if (currentAffiliations.length === 0) {
    return { synced: false, reason: "no_current_affiliations" }
  }

  const primaries = currentAffiliations.filter((a) => a.isPrimary)

  if (primaries.length === 1) {
    // Case 1: exactly one primary — sync from it
    const primary = primaries[0]
    await prisma.contact.update({
      where: { id: contactId },
      data: {
        organization: primary.organization.name,
        title: primary.title || undefined,
        updatedAt: new Date().toISOString(),
      },
    })
    return { synced: true, source: "primary" }
  }

  if (primaries.length > 1) {
    // Case 4: multiple primaries — data integrity issue
    return { synced: false, reason: "multiple_primary", count: primaries.length }
  }

  // No primaries set
  if (currentAffiliations.length === 1) {
    // Case 2: single current, no primary — auto-promote
    const single = currentAffiliations[0]
    await prisma.contactAffiliation.update({
      where: { id: single.id },
      data: { isPrimary: true, updatedAt: new Date().toISOString() },
    })
    await prisma.contact.update({
      where: { id: contactId },
      data: {
        organization: single.organization.name,
        title: single.title || undefined,
        updatedAt: new Date().toISOString(),
      },
    })
    return { synced: true, source: "auto_promoted" }
  }

  // Case 3: multiple current, no primary — ambiguous
  return { synced: false, reason: "ambiguous_no_primary", count: currentAffiliations.length }
}
