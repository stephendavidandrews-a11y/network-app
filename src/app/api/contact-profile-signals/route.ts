import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { v4 as uuidv4 } from "uuid"

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const contactId = searchParams.get("contactId")
  const where: Record<string, unknown> = {}
  if (contactId) where.contactId = contactId

  const signals = await prisma.contactProfileSignal.findMany({
    where, orderBy: { createdAt: "desc" }, take: 100, include: { contact: true },
  })
  return NextResponse.json(signals)
}

/**
 * Dedup/upsert strategy:
 * 1. Full provenance triple (sourceSystem + sourceId + sourceClaimId) -> upsert
 * 2. Conversation-based fallback (contactId + signalType + sourceId) -> upsert
 * 3. No match -> create new record
 * Fallback: tier 2 covers vocal/what_changed signals that lack sourceClaimId
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    if (!body.contactId || !body.signalType || !body.content) {
      return NextResponse.json({ error: "contactId, signalType, and content required" }, { status: 400 })
    }

    // Tier 1: full provenance triple
    if (body.sourceClaimId && body.sourceSystem && body.sourceId) {
      const existing = await prisma.contactProfileSignal.findFirst({
        where: { sourceSystem: body.sourceSystem, sourceId: body.sourceId, sourceClaimId: body.sourceClaimId },
      })
      if (existing) {
        const updated = await prisma.contactProfileSignal.update({
          where: { id: existing.id },
          data: { content: body.content, confidence: body.confidence ?? existing.confidence, conversationDate: body.conversationDate ?? existing.conversationDate, updatedAt: new Date().toISOString().replace("T", " ").slice(0, 19) },
        })
        return NextResponse.json({ ...updated, action: "updated" }, { status: 200 })
      }
    }

    // Tier 2: conversation-based
    if (body.sourceId && body.contactId) {
      const existing = await prisma.contactProfileSignal.findFirst({
        where: { contactId: body.contactId, signalType: body.signalType, sourceId: body.sourceId },
      })
      if (existing) {
        const updated = await prisma.contactProfileSignal.update({
          where: { id: existing.id },
          data: { content: body.content, confidence: body.confidence ?? existing.confidence, sourceClaimId: body.sourceClaimId ?? existing.sourceClaimId, conversationDate: body.conversationDate ?? existing.conversationDate, updatedAt: new Date().toISOString().replace("T", " ").slice(0, 19) },
        })
        return NextResponse.json({ ...updated, action: "updated" }, { status: 200 })
      }
    }

    const signal = await prisma.contactProfileSignal.create({
      data: {
        id: uuidv4(), contactId: body.contactId, signalType: body.signalType, content: body.content,
        confidence: body.confidence || null, conversationDate: body.conversationDate || null,
        sourceSystem: body.sourceSystem || null, sourceId: body.sourceId || null, sourceClaimId: body.sourceClaimId || null,
      },
    })
    return NextResponse.json({ ...signal, action: "created" }, { status: 201 })
  } catch (error) {
    console.error("Error creating profile signal:", error)
    return NextResponse.json({ error: "Failed to create profile signal" }, { status: 500 })
  }
}
