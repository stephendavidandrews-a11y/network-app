import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const contact = await prisma.contact.findUnique({
    where: { id: params.id },
    include: {
      interactions: { orderBy: { date: 'desc' }, take: 20 },
      signals: { orderBy: { detectedAt: 'desc' }, take: 10 },
    },
  })

  if (!contact) {
    return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
  }

  return NextResponse.json(contact)
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = await request.json()

  const contact = await prisma.contact.update({
    where: { id: params.id },
    data: {
      name: body.name,
      title: body.title,
      organization: body.organization,
      email: body.email,
      phone: body.phone,
      linkedinUrl: body.linkedinUrl,
      twitterHandle: body.twitterHandle,
      personalWebsite: body.personalWebsite,
      tier: body.tier,
      categories: JSON.stringify(body.categories || []),
      tags: JSON.stringify(body.tags || []),
      targetCadenceDays: body.targetCadenceDays,
      status: body.status,
      ...(body.contactType !== undefined && { contactType: body.contactType }),
      introductionPathway: body.introductionPathway,
      connectionToHawleyOrbit: body.connectionToHawleyOrbit,
      whyTheyMatter: body.whyTheyMatter,
      notes: body.notes,
      updatedAt: new Date().toISOString(),
    },
  })

  return NextResponse.json(contact)
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  await prisma.contact.delete({ where: { id: params.id } })
  return NextResponse.json({ success: true })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  /**
   * Partial update for contact fields.
   * Accepts any subset of contact fields and updates only those provided.
   * Does NOT overwrite unspecified fields (unlike PUT which requires full body).
   * Used by Sauron for lightweight flat-field enrichment (title, org, email, etc.).
   *
   * SCOPE: This endpoint is for scalar/flat-field enrichment only.
   * Structured role/affiliation changes (job history, org relationships)
   * must go through the ContactAffiliation lane, not direct contact patching.
   */
  const body = await request.json()

  // Verify contact exists
  const existing = await prisma.contact.findUnique({
    where: { id: params.id },
  })
  if (!existing) {
    return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
  }

  // Build update data from only the fields that were explicitly provided
  const allowedFields = [
    'name', 'title', 'organization', 'email', 'phone',
    'linkedinUrl', 'twitterHandle', 'personalWebsite',
    'tier', 'categories', 'tags', 'targetCadenceDays',
    'status', 'contactType', 'introductionPathway',
    'connectionToHawleyOrbit', 'whyTheyMatter', 'notes',
  ]

  const data: Record<string, any> = {}
  for (const field of allowedFields) {
    if (field in body) {
      if (field === 'categories' || field === 'tags') {
        data[field] = JSON.stringify(body[field] || [])
      } else {
        data[field] = body[field]
      }
    }
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json(
      { error: 'No valid fields provided' },
      { status: 400 }
    )
  }

  data.updatedAt = new Date().toISOString()

  const contact = await prisma.contact.update({
    where: { id: params.id },
    data,
  })

  return NextResponse.json({ ...contact, action: 'patched' })
}
