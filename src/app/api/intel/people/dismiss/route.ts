import { NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { extractionIds, reason } = body

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

    // Create DismissedIntelPerson record
    await (prisma as any).dismissedIntelPerson.create({
      data: {
        name: ext.discoveredName,
        organization: ext.discoveredOrg || null,
        reason: reason || null,
      },
    })

    // Update all matching extractions by name (fuzzy: just do exact + these IDs)
    await prisma.contentExtraction.updateMany({
      where: { id: { in: extractionIds } },
      data: {
        networkStatus: 'dismissed',
        processed: true,
        processedAction: 'dismissed',
      },
    })

    // Also dismiss any other extractions with the same name
    await prisma.contentExtraction.updateMany({
      where: {
        extractionType: 'person_mention',
        discoveredName: ext.discoveredName,
        networkStatus: 'new_potential',
      },
      data: {
        networkStatus: 'dismissed',
        processed: true,
        processedAction: 'dismissed',
      },
    })

    return NextResponse.json({
      dismissed: true,
      name: ext.discoveredName,
      message: `Dismissed ${ext.discoveredName}`,
    })
  } catch (error) {
    console.error('Dismiss error:', error)
    return NextResponse.json({ error: 'Failed to dismiss' }, { status: 500 })
  }
}
