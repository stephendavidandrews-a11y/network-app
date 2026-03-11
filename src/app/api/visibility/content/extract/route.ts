import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { extractIntelContent } from '@/lib/visibility/content-extractor'

// POST /api/visibility/content/extract - Manual extraction
export async function POST() {
  try {
    console.log('[API] Manual content extraction triggered')
    const result = await extractIntelContent(prisma)
    return NextResponse.json({
      ...result,
      message: `Extracted intelligence from ${result.extracted} articles (${result.empty} empty, ${result.errors} errors)`,
    })
  } catch (error) {
    console.error('[API] POST /visibility/content/extract error:', error)
    return NextResponse.json({ error: 'Extraction failed: ' + String(error) }, { status: 500 })
  }
}
