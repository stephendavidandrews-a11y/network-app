import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"

function normalizeOrgName(name: string): string {
  return name.toLowerCase().trim()
    .replace(/[.,]/g, "")
    .replace(/\s+/g, " ")
}

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
      organization: { select: { id: true, name: true } },
    },
    orderBy: [{ isCurrent: "desc" }, { createdAt: "desc" }],
  })
  return NextResponse.json(affiliations)
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    if (!body.contactId) {
      return NextResponse.json({ error: "contactId is required" }, { status: 400 })
    }

    let orgId = body.organizationId
    if (!orgId && body.organizationName) {
      const normalizedName = normalizeOrgName(body.organizationName)
      let org = await prisma.organization.findUnique({ where: { normalizedName } })
      if (!org) {
        org = await prisma.organization.create({
          data: { name: body.organizationName.trim(), normalizedName },
        })
      }
      orgId = org.id
    }
    if (!orgId) {
      return NextResponse.json({ error: "organizationId or organizationName required" }, { status: 400 })
    }

    // Dedup: full triple
    if (body.sourceClaimId && body.sourceSystem && body.sourceId) {
      const existing = await prisma.contactAffiliation.findFirst({
        where: { sourceSystem: body.sourceSystem, sourceId: body.sourceId, sourceClaimId: body.sourceClaimId },
      })
      if (existing) {
        const updated = await prisma.contactAffiliation.update({
          where: { id: existing.id },
          data: { title: body.title ?? existing.title, department: body.department ?? existing.department, roleType: body.roleType ?? existing.roleType, isCurrent: body.isCurrent ?? existing.isCurrent, notes: body.notes ?? existing.notes },
        })
        return NextResponse.json(updated, { status: 200 })
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
          data: { title: body.title ?? contentMatch.title, department: body.department ?? contentMatch.department, isCurrent: body.isCurrent ?? contentMatch.isCurrent },
        })
        return NextResponse.json(updated, { status: 200 })
      }
    }

    const affiliation = await prisma.contactAffiliation.create({
      data: {
        contactId: body.contactId,
        organizationId: orgId,
        title: body.title || null,
        department: body.department || null,
        roleType: body.roleType || null,
        isCurrent: body.isCurrent ?? true,
        startDate: body.startDate || null,
        endDate: body.endDate || null,
        notes: body.notes || null,
        sourceSystem: body.sourceSystem || null,
        sourceId: body.sourceId || null,
        sourceClaimId: body.sourceClaimId || null,
      },
    })
    return NextResponse.json(affiliation, { status: 201 })
  } catch (error) {
    console.error("[Affiliations] POST error:", error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
