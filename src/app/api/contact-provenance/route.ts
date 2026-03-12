import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const contactId = searchParams.get("contactId")

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {}
  if (contactId) {
    where.contactId = contactId
  }

  const provenance = await prisma.contactProvenance.findMany({
    where,
    include: {
      contact: { select: { name: true, organization: true } },
      sourceContact: { select: { name: true, organization: true } },
    },
    orderBy: { createdAt: "desc" },
  })

  return NextResponse.json(provenance)
}

export async function POST(request: NextRequest) {
  const body = await request.json()

  if (!body.contactId) {
    return NextResponse.json(
      { error: "contactId is required" },
      { status: 400 }
    )
  }

  if (!body.type) {
    return NextResponse.json(
      { error: "type is required (e.g., referral, conference, cold_outreach, colleague)" },
      { status: 400 }
    )
  }

  // Dedup strategy:
  // 1. Full provenance triple (sourceSystem, sourceId, sourceClaimId) when all 3 present
  // 2. (contactId, sourceContactId, type, sourceId) when sourceContactId is provided
  // 3. (contactId, type, sourceId) for non-person provenance (no introducer)
  // 4. Otherwise: insert

  // Path 1: Full triple dedup
  if (body.sourceSystem && body.sourceId && body.sourceClaimId) {
    const existing = await prisma.contactProvenance.findFirst({
      where: {
        sourceSystem: body.sourceSystem,
        sourceId: body.sourceId,
        sourceClaimId: body.sourceClaimId,
      },
    })
    if (existing) {
      const updated = await prisma.contactProvenance.update({
        where: { id: existing.id },
        data: {
          type: body.type ?? existing.type,
          notes: body.notes ?? existing.notes,
          sourceContactId: body.sourceContactId ?? existing.sourceContactId,
          eventId: body.eventId ?? existing.eventId,
          sourceInteractionId: body.sourceInteractionId ?? existing.sourceInteractionId,
        },
      })
      return NextResponse.json(updated, { status: 200 })
    }
  }

  // Path 2: Person-introduced dedup (contactId + sourceContactId + type + sourceId)
  if (body.sourceContactId && body.sourceId) {
    const existing = await prisma.contactProvenance.findFirst({
      where: {
        contactId: body.contactId,
        sourceContactId: body.sourceContactId,
        type: body.type,
        sourceId: body.sourceId,
      },
    })
    if (existing) {
      const updated = await prisma.contactProvenance.update({
        where: { id: existing.id },
        data: {
          notes: body.notes ?? existing.notes,
          sourceSystem: body.sourceSystem ?? existing.sourceSystem,
        },
      })
      return NextResponse.json(updated, { status: 200 })
    }
  }

  // Path 3: Non-person provenance dedup (contactId + type + sourceId, no introducer)
  if (!body.sourceContactId && body.sourceId) {
    const existing = await prisma.contactProvenance.findFirst({
      where: {
        contactId: body.contactId,
        sourceContactId: null,
        type: body.type,
        sourceId: body.sourceId,
      },
    })
    if (existing) {
      const updated = await prisma.contactProvenance.update({
        where: { id: existing.id },
        data: {
          notes: body.notes ?? existing.notes,
          eventId: body.eventId ?? existing.eventId,
          sourceInteractionId: body.sourceInteractionId ?? existing.sourceInteractionId,
        },
      })
      return NextResponse.json(updated, { status: 200 })
    }
  }

  // Path 4: Create new provenance record
  // sourceContactId is now nullable — no self-ref fallback
  try {
    const provenance = await prisma.contactProvenance.create({
      data: {
        contactId: body.contactId,
        sourceContactId: body.sourceContactId || null,
        type: body.type,
        eventId: body.eventId || null,
        sourceInteractionId: body.sourceInteractionId || null,
        notes: body.notes || null,
        sourceSystem: body.sourceSystem || null,
        sourceId: body.sourceId || null,
        sourceClaimId: body.sourceClaimId || null,
      },
    })
    return NextResponse.json(provenance, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (message.includes("UNIQUE constraint")) {
      return NextResponse.json(
        { error: "Provenance record already exists for this combination" },
        { status: 409 }
      )
    }
    throw err
  }
}
