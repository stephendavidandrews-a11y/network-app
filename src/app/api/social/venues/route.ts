import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const venueType = request.nextUrl.searchParams.get('type')
    const neighborhood = request.nextUrl.searchParams.get('neighborhood')

    const where: Record<string, unknown> = {}
    if (venueType) where.venueType = venueType
    if (neighborhood) where.neighborhood = neighborhood

    const venues = await prisma.personalVenue.findMany({
      where,
      orderBy: { name: 'asc' },
    })
    return NextResponse.json(venues)
  } catch (error) {
    console.error('[Venues] GET error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    if (!body.name) {
      return NextResponse.json({ error: 'name required' }, { status: 400 })
    }

    const venue = await prisma.personalVenue.create({
      data: {
        name: body.name.trim(),
        venueType: body.venueType || 'other',
        neighborhood: body.neighborhood || null,
        city: body.city || 'Washington, DC',
        priceRange: body.priceRange || null,
        goodFor: JSON.stringify(body.goodFor || []),
        notes: body.notes || null,
      },
    })
    return NextResponse.json(venue, { status: 201 })
  } catch (error) {
    console.error('[Venues] POST error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
