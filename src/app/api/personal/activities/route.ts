import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"

export async function GET(request: NextRequest) {
  try {
    const contactId = request.nextUrl.searchParams.get("contactId")
    if (!contactId) {
      return NextResponse.json({ error: "contactId required" }, { status: 400 })
    }

    const activities = await prisma.personalActivity.findMany({
      where: { contactId },
      orderBy: { createdAt: "desc" },
    })
    return NextResponse.json(activities)
  } catch (error) {
    console.error("[Activities] GET error:", error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    if (!body.contactId || !body.activity) {
      return NextResponse.json({ error: "contactId and activity required" }, { status: 400 })
    }

    // Dedup priority 1: full triple (sourceSystem, sourceId, sourceClaimId)
    if (body.sourceClaimId && body.sourceSystem && body.sourceId) {
      const existing = await prisma.personalActivity.findFirst({
        where: {
          sourceSystem: body.sourceSystem,
          sourceId: body.sourceId,
          sourceClaimId: body.sourceClaimId,
        },
      })
      if (existing) {
        const updated = await prisma.personalActivity.update({
          where: { id: existing.id },
          data: {
            activity: body.activity.trim(),
            confidence: body.confidence || existing.confidence,
            lastMentioned: new Date().toISOString(),
          },
        })
        return NextResponse.json(updated, { status: 200 })
      }
    }

    // Dedup priority 2: content-based fallback (same contact + text + source conversation)
    if (body.sourceSystem && body.sourceId) {
      const contentMatch = await prisma.personalActivity.findFirst({
        where: {
          contactId: body.contactId,
          activity: body.activity.trim(),
          sourceSystem: body.sourceSystem,
          sourceId: body.sourceId,
        },
      })
      if (contentMatch) {
        const updated = await prisma.personalActivity.update({
          where: { id: contentMatch.id },
          data: {
            lastMentioned: new Date().toISOString(),
          },
        })
        return NextResponse.json(updated, { status: 200 })
      }
    }

    const activity = await prisma.personalActivity.create({
      data: {
        contactId: body.contactId,
        activity: body.activity.trim(),
        frequency: body.frequency || "occasional",
        confidence: body.confidence || "medium",
        source: body.source || "manual",
        sourceSystem: body.sourceSystem || null,
        sourceId: body.sourceId || null,
        sourceClaimId: body.sourceClaimId || null,
      },
    })
    return NextResponse.json(activity, { status: 201 })
  } catch (error) {
    console.error("[Activities] POST error:", error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get("id")
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 })
    }

    await prisma.personalActivity.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[Activities] DELETE error:", error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
