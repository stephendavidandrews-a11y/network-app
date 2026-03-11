import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const venue = await prisma.personalVenue.findUnique({
      where: { id: params.id },
      include: {
        socialPlans: {
          orderBy: { targetDate: 'desc' },
          take: 10,
        },
      },
    })

    if (!venue) {
      return NextResponse.json({ error: 'Venue not found' }, { status: 404 })
    }
    return NextResponse.json(venue)
  } catch (error) {
    console.error('[Venue] GET error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json()
    const venue = await prisma.personalVenue.update({
      where: { id: params.id },
      data: {
        ...(body.name && { name: body.name.trim() }),
        ...(body.venueType && { venueType: body.venueType }),
        ...(body.neighborhood !== undefined && { neighborhood: body.neighborhood }),
        ...(body.city && { city: body.city }),
        ...(body.priceRange !== undefined && { priceRange: body.priceRange }),
        ...(body.goodFor && { goodFor: JSON.stringify(body.goodFor) }),
        ...(body.notes !== undefined && { notes: body.notes }),
        ...(body.lastVisited && { lastVisited: body.lastVisited }),
        ...(body.timesVisited !== undefined && { timesVisited: body.timesVisited }),
      },
    })
    return NextResponse.json(venue)
  } catch (error) {
    console.error('[Venue] PUT error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await prisma.personalVenue.delete({ where: { id: params.id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Venue] DELETE error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
