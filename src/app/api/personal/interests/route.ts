import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"

export async function GET(request: NextRequest) {
  try {
    const contactId = request.nextUrl.searchParams.get("contactId")
    if (!contactId) {
      return NextResponse.json({ error: "contactId required" }, { status: 400 })
    }

    const interests = await prisma.personalInterest.findMany({
      where: { contactId },
      orderBy: { createdAt: "desc" },
    })
    return NextResponse.json(interests)
  } catch (error) {
    console.error("[Interests] GET error:", error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    if (!body.contactId || !body.interest) {
      return NextResponse.json({ error: "contactId and interest required" }, { status: 400 })
    }

    // Dedup priority 1: full triple (sourceSystem, sourceId, sourceClaimId)
    if (body.sourceClaimId && body.sourceSystem && body.sourceId) {
      const existing = await prisma.personalInterest.findFirst({
        where: {
          sourceSystem: body.sourceSystem,
          sourceId: body.sourceId,
          sourceClaimId: body.sourceClaimId,
        },
      })
      if (existing) {
        const updated = await prisma.personalInterest.update({
          where: { id: existing.id },
          data: {
            interest: body.interest.trim(),
            confidence: body.confidence || existing.confidence,
            mentionCount: existing.mentionCount + 1,
            lastMentioned: new Date().toISOString(),
          },
        })
        return NextResponse.json(updated, { status: 200 })
      }
    }

    // Dedup priority 2: content-based fallback (same contact + text + source conversation)
    if (body.sourceSystem && body.sourceId) {
      const contentMatch = await prisma.personalInterest.findFirst({
        where: {
          contactId: body.contactId,
          interest: body.interest.trim(),
          sourceSystem: body.sourceSystem,
          sourceId: body.sourceId,
        },
      })
      if (contentMatch) {
        const updated = await prisma.personalInterest.update({
          where: { id: contentMatch.id },
          data: {
            mentionCount: contentMatch.mentionCount + 1,
            lastMentioned: new Date().toISOString(),
          },
        })
        return NextResponse.json(updated, { status: 200 })
      }
    }

    const interest = await prisma.personalInterest.create({
      data: {
        contactId: body.contactId,
        interest: body.interest.trim(),
        confidence: body.confidence || "medium",
        source: body.source || "manual",
        sourceSystem: body.sourceSystem || null,
        sourceId: body.sourceId || null,
        sourceClaimId: body.sourceClaimId || null,
      },
    })
    return NextResponse.json(interest, { status: 201 })
  } catch (error) {
    console.error("[Interests] POST error:", error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get("id")
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 })
    }

    await prisma.personalInterest.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[Interests] DELETE error:", error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
