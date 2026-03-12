import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { resolveOrganization } from "@/lib/orgResolver"
import { syncPrimaryAffiliationToContact, SyncResult } from "@/lib/affiliationSync"

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const contactId = searchParams.get("contactId")
  const organizationId = searchParams.get("organizationId")
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {}
  if (contactId) where.contactId = contactId
  if (organizationId) where.organizationId = organizationId

  const affiliations = await prisma.contactAffiliation.findMany({
    where,
    include: {
      contact: { select: { id: true, name: true } },
      organization: { select: { id: true, name: true, industry: true } },
    },
    orderBy: [{ isCurrent: "desc" }, { createdAt: "desc" }],
  })
  return NextResponse.json(affiliations)
}

/**
 * Dedup/upsert strategy:
 * 1. Full provenance triple (sourceSystem + sourceId + sourceClaimId) -> upsert
 * 2. Content-based fallback (contactId + organizationId + sourceSystem + sourceId) -> upsert
 * 3. No match -> create new record
 * Fallback: when sourceClaimId is absent, tier 2 prevents duplicates from same conversation
 *
 * isPrimary policy: conservative default (false for Sauron-sourced).
 * Only explicit isPrimary=true in payload or the sync decision tree may promote.
 * After create/update, syncPrimaryAffiliationToContact runs to update flat Contact fields.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    if (!body.contactId) {
      return NextResponse.json({ error: "contactId is required" }, { status: 400 })
    }

    let orgId = body.organizationId
    let resolutionSource: string | null = null
    if (!orgId && body.organizationName) {
      const result = await resolveOrganization(prisma, body.organizationName)
      if (!result.organization) {
        return NextResponse.json(
          { error: "Organization not resolved", resolutionSource: result.resolutionSource },
          { status: 422 }
        )
      }
      orgId = result.organization.id
      resolutionSource = result.resolutionSource
    }
    if (!orgId) {
      return NextResponse.json({ error: "organizationId or organizationName required" }, { status: 400 })
    }

    let isPrimaryValue = false
    if (body.isPrimary === true) { isPrimaryValue = true }

    if (isPrimaryValue) {
      await prisma.contactAffiliation.updateMany({
        where: { contactId: body.contactId, isCurrent: true, isPrimary: true },
        data: { isPrimary: false, updatedAt: new Date().toISOString() },
      })
    }

    // Dedup: full triple
    if (body.sourceClaimId && body.sourceSystem && body.sourceId) {
      const existing = await prisma.contactAffiliation.findFirst({
        where: { sourceSystem: body.sourceSystem, sourceId: body.sourceId, sourceClaimId: body.sourceClaimId },
      })
      if (existing) {
        const updated = await prisma.contactAffiliation.update({
          where: { id: existing.id },
          data: { title: body.title ?? existing.title, department: body.department ?? existing.department, roleType: body.roleType ?? existing.roleType, isCurrent: body.isCurrent ?? existing.isCurrent, isPrimary: isPrimaryValue || existing.isPrimary, notes: body.notes ?? existing.notes },
        })
        const syncResult = await syncPrimaryAffiliationToContact(body.contactId)
        return NextResponse.json({ ...updated, action: "updated", resolutionSource: existing.resolutionSource, syncResult }, { status: 200 })
      }
    }

    // Dedup: content-based
    if (body.sourceSystem && body.sourceId) {
      const contentMatch = await prisma.contactAffiliation.findFirst({
        where: { contactId: body.contactId, organizationId: orgId, sourceSystem: body.sourceSystem, sourceId: body.sourceId },
      })
      if (contentMatch) {
        const updated = await prisma.contactAffiliation.update({
          where: { id: contentMatch.id },
          data: { title: body.title ?? contentMatch.title, department: body.department ?? contentMatch.department, isCurrent: body.isCurrent ?? contentMatch.isCurrent, isPrimary: isPrimaryValue || contentMatch.isPrimary },
        })
        const syncResult = await syncPrimaryAffiliationToContact(body.contactId)
        return NextResponse.json({ ...updated, action: "updated", resolutionSource: contentMatch.resolutionSource, syncResult }, { status: 200 })
      }
    }

    const affiliation = await prisma.contactAffiliation.create({
      data: {
        contactId: body.contactId, organizationId: orgId,
        title: body.title || null, department: body.department || null, roleType: body.roleType || null,
        isCurrent: body.isCurrent ?? true, isPrimary: isPrimaryValue,
        startDate: body.startDate || null, endDate: body.endDate || null, notes: body.notes || null,
        sourceSystem: body.sourceSystem || null, sourceId: body.sourceId || null, sourceClaimId: body.sourceClaimId || null,
        resolutionSource,
      },
    })
    const syncResult = await syncPrimaryAffiliationToContact(body.contactId)
    return NextResponse.json({ ...affiliation, action: "created", syncResult }, { status: 201 })
  } catch (error) {
    console.error("[Affiliations] POST error:", error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
