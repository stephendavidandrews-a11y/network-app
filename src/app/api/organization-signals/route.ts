import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { resolveOrganization } from "@/lib/orgResolver"

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const organizationId = searchParams.get("organizationId")

  const signals = await prisma.organizationSignal.findMany({
    where: organizationId ? { organizationId } : {},
    include: { organization: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  })
  return NextResponse.json(signals)
}

/**
 * Dedup/upsert strategy:
 * 1. Full provenance triple (sourceSystem + sourceId + sourceClaimId) -> upsert
 * 2. Content-based fallback (organizationId + signalType + title + sourceSystem + sourceId) -> upsert
 * 3. No match -> create new record
 * Fallback: when sourceClaimId is absent, tier 2 content match prevents duplicates
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

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
      return NextResponse.json({ error: "organizationId or organizationName is required" }, { status: 400 })
    }
    if (!body.signalType || !body.description) {
      return NextResponse.json({ error: "signalType and description are required" }, { status: 400 })
    }

    // Dedup priority 1: full triple
    if (body.sourceClaimId && body.sourceSystem && body.sourceId) {
      const existing = await prisma.organizationSignal.findFirst({
        where: { sourceSystem: body.sourceSystem, sourceId: body.sourceId, sourceClaimId: body.sourceClaimId },
      })
      if (existing) {
        const updated = await prisma.organizationSignal.update({
          where: { id: existing.id },
          data: {
            title: body.title ?? existing.title,
            description: body.description ?? existing.description,
            confidence: body.confidence ?? existing.confidence,
            relatedOrg: body.relatedOrg ?? existing.relatedOrg,
            relationshipType: body.relationshipType ?? existing.relationshipType,
          },
        })
        return NextResponse.json({ ...updated, action: "updated", resolutionSource: existing.resolutionSource }, { status: 200 })
      }
    }

    // Dedup priority 2: content-based
    if (body.sourceSystem && body.sourceId) {
      const contentMatch = await prisma.organizationSignal.findFirst({
        where: { organizationId: orgId, signalType: body.signalType, title: body.title || null, sourceSystem: body.sourceSystem, sourceId: body.sourceId },
      })
      if (contentMatch) {
        const updated = await prisma.organizationSignal.update({
          where: { id: contentMatch.id },
          data: {
            description: body.description ?? contentMatch.description,
            confidence: body.confidence ?? contentMatch.confidence,
            relatedOrg: body.relatedOrg ?? contentMatch.relatedOrg,
            relationshipType: body.relationshipType ?? contentMatch.relationshipType,
          },
        })
        return NextResponse.json({ ...updated, action: "updated", resolutionSource: contentMatch.resolutionSource }, { status: 200 })
      }
    }

    const signal = await prisma.organizationSignal.create({
      data: {
        organizationId: orgId,
        signalType: body.signalType,
        title: body.title || null,
        description: body.description,
        confidence: body.confidence || null,
        observedAt: body.observedAt || new Date().toISOString().replace("T", " ").slice(0, 19),
        sourceSystem: body.sourceSystem || null,
        sourceId: body.sourceId || null,
        sourceClaimId: body.sourceClaimId || null,
        resolutionSource,
        relatedOrg: body.relatedOrg || null,
        relationshipType: body.relationshipType || null,
      },
    })

    // Side-effect: industry_mention auto-fill (Wave 2)
    if (body.signalType === "industry_mention" && body.industry) {
      try {
        const org = await prisma.organization.findUnique({ where: { id: orgId } })
        if (org && !org.industry) {
          await prisma.organization.update({
            where: { id: orgId },
            data: { industry: body.industry },
          })
        }
      } catch (sideEffectError) {
        console.error("[OrgSignals] industry_mention side-effect error:", sideEffectError)
      }
    }

    return NextResponse.json({ ...signal, action: "created" }, { status: 201 })
  } catch (error) {
    console.error("[OrgSignals] POST error:", error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
