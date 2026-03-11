import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const contactId = searchParams.get("contactId")

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {}
  if (contactId) {
    where.OR = [{ contactAId: contactId }, { contactBId: contactId }]
  }

  const relationships = await prisma.contactRelationship.findMany({
    where,
    include: {
      contactA: { select: { name: true, organization: true } },
      contactB: { select: { name: true, organization: true } },
    },
    orderBy: { createdAt: "desc" },
  })

  return NextResponse.json(relationships)
}

export async function POST(request: NextRequest) {
  const body = await request.json()

  if (!body.contactAId || !body.contactBId) {
    return NextResponse.json(
      { error: "contactAId and contactBId are required" },
      { status: 400 }
    )
  }

  // Upsert on sourceSystem + sourceId if provided
  if (body.sourceSystem && body.sourceId) {
    const existing = await prisma.contactRelationship.findFirst({
      where: { sourceSystem: body.sourceSystem, sourceId: body.sourceId },
    })
    if (existing) {
      const updated = await prisma.contactRelationship.update({
        where: { id: existing.id },
        data: {
          relationshipType: body.relationshipType || existing.relationshipType,
          strength: body.strength ?? existing.strength,
          notes: body.notes || existing.notes,
          observationSource: body.observationSource || existing.observationSource,
          observationCount: { increment: 1 },
          lastObserved: new Date().toISOString(),
        },
      })
      return NextResponse.json(updated, { status: 200 })
    }
  }

  // Also check for existing pair (A,B) or (B,A) to avoid duplicates
  const existingPair = await prisma.contactRelationship.findFirst({
    where: {
      OR: [
        { contactAId: body.contactAId, contactBId: body.contactBId },
        { contactAId: body.contactBId, contactBId: body.contactAId },
      ],
    },
  })
  if (existingPair) {
    const updated = await prisma.contactRelationship.update({
      where: { id: existingPair.id },
      data: {
        relationshipType: body.relationshipType || existingPair.relationshipType,
        strength: body.strength ?? existingPair.strength,
        source: body.source || existingPair.source,
        notes: body.notes || existingPair.notes,
        observationSource: body.observationSource || existingPair.observationSource,
        observationCount: { increment: 1 },
        lastObserved: new Date().toISOString(),
        sourceSystem: body.sourceSystem || existingPair.sourceSystem,
        sourceId: body.sourceId || existingPair.sourceId,
      },
    })
    return NextResponse.json(updated, { status: 200 })
  }

  const relationship = await prisma.contactRelationship.create({
    data: {
      contactAId: body.contactAId,
      contactBId: body.contactBId,
      relationshipType: body.relationshipType || null,
      strength: body.strength ?? 3,
      source: body.source || "manual",
      notes: body.notes || null,
      observationSource: body.observationSource || null,
      sourceSystem: body.sourceSystem || null,
      sourceId: body.sourceId || null,
      lastObserved: new Date().toISOString(),
    },
  })

  return NextResponse.json(relationship, { status: 201 })
}
