import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { triageIntelContent } from '@/lib/visibility/content-triage'
import { fetchIntelContent } from '@/lib/visibility/content-fetcher'

// POST /api/visibility/content/ingest - Manual triage + fetch
export async function POST() {
  try {
    console.log('[API] Manual content ingestion triggered')

    // Step 1: Triage (title-level scoring)
    const triageResult = await triageIntelContent(prisma)

    // Step 2: Fetch full text for triaged items
    const fetchResult = await fetchIntelContent(prisma)

    return NextResponse.json({
      triage: triageResult,
      fetch: fetchResult,
      message: `Triaged ${triageResult.triaged} articles (filtered ${triageResult.filtered}), fetched ${fetchResult.fetched} full texts`,
    })
  } catch (error) {
    console.error('[API] POST /visibility/content/ingest error:', error)
    return NextResponse.json({ error: 'Ingestion failed: ' + String(error) }, { status: 500 })
  }
}
