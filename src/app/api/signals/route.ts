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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    if (!body.contactId || !body.signalType || !body.title) {
      return NextResponse.json({ error: "contactId, signalType, and title required" }, { status: 400 })
    }

    // Dedup priority 1: full triple (sourceSystem, sourceId, sourceClaimId)
    if (body.sourceClaimId && body.sourceSystem && body.sourceId) {
      const existing = await prisma.intelligenceSignal.findFirst({
        where: {
          sourceSystem: body.sourceSystem,
          sourceId: body.sourceId,
          sourceClaimId: body.sourceClaimId,
        },
      })
      if (existing) {
        const updated = await prisma.intelligenceSignal.update({
          where: { id: existing.id },
          data: {
            title: body.title,
            description: body.description ?? existing.description,
            relevanceScore: body.relevanceScore ?? existing.relevanceScore,
            outreachHook: body.outreachHook ?? existing.outreachHook,
          },
        })
        return NextResponse.json(updated, { status: 200 })
      }
    }

    // Dedup priority 2: content-based fallback (same contact + title + source conversation)
    if (body.sourceSystem && body.sourceId) {
      const contentMatch = await prisma.intelligenceSignal.findFirst({
        where: {
          contactId: body.contactId,
          signalType: body.signalType,
          title: body.title,
          sourceSystem: body.sourceSystem,
          sourceId: body.sourceId,
        },
      })
      if (contentMatch) {
        const updated = await prisma.intelligenceSignal.update({
          where: { id: contentMatch.id },
          data: {
            description: body.description ?? contentMatch.description,
            relevanceScore: body.relevanceScore ?? contentMatch.relevanceScore,
            outreachHook: body.outreachHook ?? contentMatch.outreachHook,
          },
        })
        return NextResponse.json(updated, { status: 200 })
      }
    }

    const signal = await prisma.intelligenceSignal.create({
      data: {
        contactId: body.contactId,
        signalType: body.signalType,
        title: body.title,
        description: body.description || null,
        sourceUrl: body.sourceUrl || null,
        sourceName: body.sourceName || null,
        outreachHook: body.outreachHook || null,
        relevanceScore: body.relevanceScore || 5.0,
        sourceSystem: body.sourceSystem || null,
        sourceId: body.sourceId || null,
        sourceClaimId: body.sourceClaimId || null,
      },
    })
    return NextResponse.json(signal, { status: 201 })
  } catch (error) {
    console.error("[Signals] POST error:", error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
