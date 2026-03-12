import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"

export async function GET() {
  const signals = await prisma.intelligenceSignal.findMany({
    orderBy: { detectedAt: "desc" },
    take: 100,
    include: { contact: true },
  })
  return NextResponse.json(signals)
}

/**
 * Dedup/upsert strategy:
 * 1. Full provenance triple (sourceSystem + sourceId + sourceClaimId) -> upsert
 * 2. Content-based fallback (contactId + signalType + title + sourceSystem + sourceId) -> upsert
 * 3. No match -> create new record
 * Fallback: when sourceClaimId is absent, tier 2 prevents duplicates from same conversation
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    if (!body.contactId || !body.signalType || !body.title) {
      return NextResponse.json({ error: "contactId, signalType, and title required" }, { status: 400 })
    }

    if (body.sourceClaimId && body.sourceSystem && body.sourceId) {
      const existing = await prisma.intelligenceSignal.findFirst({
        where: { sourceSystem: body.sourceSystem, sourceId: body.sourceId, sourceClaimId: body.sourceClaimId },
      })
      if (existing) {
        const updated = await prisma.intelligenceSignal.update({
          where: { id: existing.id },
          data: { title: body.title, description: body.description ?? existing.description, relevanceScore: body.relevanceScore ?? existing.relevanceScore, outreachHook: body.outreachHook ?? existing.outreachHook },
        })
        return NextResponse.json({ ...updated, action: "updated" }, { status: 200 })
      }
    }

    if (body.sourceSystem && body.sourceId) {
      const contentMatch = await prisma.intelligenceSignal.findFirst({
        where: { contactId: body.contactId, signalType: body.signalType, title: body.title, sourceSystem: body.sourceSystem, sourceId: body.sourceId },
      })
      if (contentMatch) {
        const updated = await prisma.intelligenceSignal.update({
          where: { id: contentMatch.id },
          data: { description: body.description ?? contentMatch.description, relevanceScore: body.relevanceScore ?? contentMatch.relevanceScore, outreachHook: body.outreachHook ?? contentMatch.outreachHook },
        })
        return NextResponse.json({ ...updated, action: "updated" }, { status: 200 })
      }
    }

    const signal = await prisma.intelligenceSignal.create({
      data: {
        contactId: body.contactId, signalType: body.signalType, title: body.title,
        description: body.description || null, sourceUrl: body.sourceUrl || null, sourceName: body.sourceName || null,
        outreachHook: body.outreachHook || null, relevanceScore: body.relevanceScore || 5.0,
        sourceSystem: body.sourceSystem || null, sourceId: body.sourceId || null, sourceClaimId: body.sourceClaimId || null,
      },
    })
    return NextResponse.json({ ...signal, action: "created" }, { status: 201 })
  } catch (error) {
    console.error("[Signals] POST error:", error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
