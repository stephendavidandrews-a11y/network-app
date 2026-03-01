import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const contacts = await prisma.contact.findMany({
      orderBy: { name: 'asc' },
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
