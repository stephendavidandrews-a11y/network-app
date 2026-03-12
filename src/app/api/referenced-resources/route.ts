import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"

export async function GET(request: NextRequest) {
  try {
    const contactId = request.nextUrl.searchParams.get("contactId")
    const where = contactId ? { contactId } : {}
    const resources = await prisma.referencedResource.findMany({ where, orderBy: { createdAt: "desc" }, take: 100 })
    return NextResponse.json(resources)
  } catch (error) {
    console.error("[ReferencedResources] GET error:", error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

/**
 * Dedup/upsert strategy:
 * 1. Full provenance triple (sourceSystem + sourceId + sourceClaimId) -> upsert
 * 2. No content-based fallback (description text is too variable for reliable matching)
 * 3. No match -> create new record
 * Fallback: when sourceClaimId is absent, no dedup -- creates a new record
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    if (!body.description) {
      return NextResponse.json({ error: "description required" }, { status: 400 })
    }

    if (body.sourceClaimId && body.sourceSystem && body.sourceId) {
      const existing = await prisma.referencedResource.findFirst({
        where: { sourceSystem: body.sourceSystem, sourceId: body.sourceId, sourceClaimId: body.sourceClaimId },
      })
      if (existing) {
        const updated = await prisma.referencedResource.update({
          where: { id: existing.id },
          data: { description: body.description, resourceType: body.resourceType ?? existing.resourceType, url: body.url ?? existing.url, action: body.action ?? existing.action },
        })
        return NextResponse.json({ ...updated, action: "updated" }, { status: 200 })
      }
    }

    const resource = await prisma.referencedResource.create({
      data: {
        contactId: body.contactId || null, description: body.description,
        resourceType: body.resourceType || "other", url: body.url || null, action: body.action || "reference_only",
        sourceSystem: body.sourceSystem || null, sourceId: body.sourceId || null, sourceClaimId: body.sourceClaimId || null,
      },
    })
    return NextResponse.json({ ...resource, action: "created" }, { status: 201 })
  } catch (error) {
    console.error("[ReferencedResources] POST error:", error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
