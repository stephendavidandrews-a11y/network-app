import { NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { extractionIds, tier, notes } = body

    if (!extractionIds || extractionIds.length === 0) {
      return NextResponse.json({ error: 'extractionIds required' }, { status: 400 })
    }

    // Get the first extraction to pull person details
    const ext = await prisma.contentExtraction.findFirst({
      where: { id: { in: extractionIds } },
    })

    if (!ext || !ext.discoveredName) {
      return NextResponse.json({ error: 'Extraction not found or no name' }, { status: 404 })
    }

    // Create Contact stub
    const contact = await prisma.contact.create({
      data: {
        name: ext.discoveredName,
        title: ext.discoveredTitle || undefined,
        organization: ext.discoveredOrg || undefined,
        source: 'intel_pipeline',
        tier: tier || 3,
        status: 'target',
        notes: notes || ext.discoveredContext || undefined,
        categories: '[]',
        tags: '[]',
      },
    })

    // Update all matching extractions
    await prisma.contentExtraction.updateMany({
      where: { id: { in: extractionIds } },
      data: {
        networkStatus: 'known_contact',
        contactId: contact.id,
        processed: true,
        processedAction: 'approved_to_contact',
      },
    })

    return NextResponse.json({
      contactId: contact.id,
      name: ext.discoveredName,
      message: `Added ${ext.discoveredName} as Tier ${tier || 3} contact`,
    })
  } catch (error) {
    console.error('Approve error:', error)
    return NextResponse.json({ error: 'Failed to approve' }, { status: 500 })
  }
}
