import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { classifyDiscoveredEvents } from '@/lib/visibility/classify-events'

export const dynamic = 'force-dynamic'

export async function POST(_request: NextRequest) {
  try {
    let totalClassified = 0
    let totalDismissed = 0
    let totalErrors = 0

    let hasMore = true
    while (hasMore) {
      const result = await classifyDiscoveredEvents(prisma, 10)
      totalClassified += result.classified
      totalDismissed += result.dismissed
      totalErrors += result.errors
      hasMore = (result.classified + result.dismissed + result.errors) > 0
    }

    return NextResponse.json({
      classified: totalClassified,
      dismissed: totalDismissed,
      errors: totalErrors,
    })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
