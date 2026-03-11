import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const contactId = request.nextUrl.searchParams.get('contactId')
    if (!contactId) {
      return NextResponse.json({ error: 'contactId required' }, { status: 400 })
    }

    const [asA, asB] = await Promise.all([
      prisma.friendRelationship.findMany({
        where: { contactAId: contactId },
        include: { contactB: { select: { id: true, name: true, photoUrl: true } } },
      }),
      prisma.friendRelationship.findMany({
        where: { contactBId: contactId },
        include: { contactA: { select: { id: true, name: true, photoUrl: true } } },
      }),
    ])

    const relationships = [
      ...asA.map(r => ({ ...r, friend: r.contactB })),
      ...asB.map(r => ({ ...r, friend: r.contactA })),
    ]

    return NextResponse.json(relationships)
  } catch (error) {
    console.error('[Relationships] GET error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    if (!body.contactAId || !body.contactBId) {
      return NextResponse.json({ error: 'contactAId and contactBId required' }, { status: 400 })
    }

    const relationship = await prisma.friendRelationship.create({
      data: {
        contactAId: body.contactAId,
        contactBId: body.contactBId,
        relationshipType: body.relationshipType || 'know_each_other',
        source: body.source || 'manual',
        notes: body.notes || null,
      },
    })
    return NextResponse.json(relationship, { status: 201 })
  } catch (error) {
    console.error('[Relationships] POST error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get('id')
    if (!id) {
      return NextResponse.json({ error: 'id required' }, { status: 400 })
    }

    await prisma.friendRelationship.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Relationships] DELETE error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
