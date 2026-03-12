import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const search = request.nextUrl.searchParams.get('search')
    const limit = parseInt(request.nextUrl.searchParams.get('limit') || '0') || undefined

    if (search) {
      // Search mode: return { contacts: [...] } with limited fields
      const contacts = await prisma.contact.findMany({
        where: { name: { contains: search } },
        orderBy: { name: 'asc' },
        take: limit || 10,
        select: { id: true, name: true, organization: true, photoUrl: true, contactType: true, personalRing: true },
      })
      return NextResponse.json({ contacts })
    }

    // Default mode: return full array (backward compatible)
    const contacts = await prisma.contact.findMany({
      orderBy: { name: 'asc' },
      ...(limit ? { take: limit } : {}),
    })
    return NextResponse.json(contacts)
  } catch (error) {
    console.error('[Contacts API] GET error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    if (!body.name || !body.name.trim()) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    // Dedup: check if a contact with the same name already exists
    const existing = await prisma.contact.findFirst({
      where: { name: { equals: body.name.trim() } },
      select: { id: true, name: true },
    })
    if (existing) {
      return NextResponse.json(existing, { status: 200 })
    }

    const contact = await prisma.contact.create({
      data: {
        name: body.name.trim(),
        title: body.title || null,
        organization: body.organization || null,
        email: body.email || null,
        phone: body.phone || null,
        linkedinUrl: body.linkedinUrl || null,
        twitterHandle: body.twitterHandle || null,
        personalWebsite: body.personalWebsite || null,
        tier: body.tier || 2,
        categories: JSON.stringify(body.categories || []),
        tags: JSON.stringify(body.tags || []),
        targetCadenceDays: body.targetCadenceDays || 60,
        status: body.status || 'target',
        source: body.source || 'manual',
        introductionPathway: body.introductionPathway || null,
        connectionToHawleyOrbit: body.connectionToHawleyOrbit || null,
        whyTheyMatter: body.whyTheyMatter || null,
        notes: body.notes || null,
      },
    })

    return NextResponse.json(contact, { status: 201 })
  } catch (error) {
    console.error('[Contacts API] POST error:', error)
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
