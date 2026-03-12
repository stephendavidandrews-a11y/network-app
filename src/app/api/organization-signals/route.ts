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
          data: { title: body.title ?? existing.title, description: body.description ?? existing.description, confidence: body.confidence ?? existing.confidence },
        })
        return NextResponse.json(updated, { status: 200 })
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
          data: { description: body.description ?? contentMatch.description, confidence: body.confidence ?? contentMatch.confidence },
        })
        return NextResponse.json(updated, { status: 200 })
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
      },
    })
    return NextResponse.json(signal, { status: 201 })
  } catch (error) {
    console.error("[OrgSignals] POST error:", error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
