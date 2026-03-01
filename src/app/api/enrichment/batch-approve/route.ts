import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { minScore } = body

    if (typeof minScore !== 'number' || minScore < 0 || minScore > 100) {
      return NextResponse.json({ error: 'minScore must be a number between 0 and 100' }, { status: 400 })
    }

    // Find all "found" results above the threshold
    const results = await prisma.enrichmentResult.findMany({
      where: {
        status: 'found',
        score: { gte: minScore },
        email: { not: null },
      },
    })

    if (results.length === 0) {
      return NextResponse.json({ approved: 0, contactIds: [], message: 'No results meet the threshold' })
    }

    const now = new Date().toISOString()
    const approvedIds: string[] = []
    const errors: string[] = []

    for (const result of results) {
      // Check for duplicate email
      const existing = await prisma.contact.findFirst({
        where: {
          email: result.email!,
          id: { not: result.contactId },
        },
        select: { id: true, name: true },
      })

      if (existing) {
        errors.push(`${result.email} skipped — already belongs to ${existing.name}`)
        continue
      }

      try {
        await prisma.$transaction([
          prisma.contact.update({
            where: { id: result.contactId },
            data: { email: result.email! },
          }),
          prisma.enrichmentResult.update({
            where: { id: result.id },
            data: { status: 'approved', reviewedAt: now },
          }),
        ])
        approvedIds.push(result.contactId)
      } catch (err) {
        errors.push(`Failed to approve ${result.email}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    return NextResponse.json({
      approved: approvedIds.length,
      contactIds: approvedIds,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (error) {
    console.error('[Enrichment] Batch approve error:', error)
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
