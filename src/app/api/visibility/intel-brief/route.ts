import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { generateIntelBrief } from '@/lib/visibility/intel-brief'

// GET /api/visibility/intel-brief - List briefs
export async function GET() {
  try {
    const briefs = await prisma.intelBrief.findMany({
      orderBy: { generatedAt: 'desc' },
      take: 20,
    })

    const enriched = briefs.map(b => ({
      ...b,
      contentStats: b.contentStats ? JSON.parse(b.contentStats) : {},
    }))

    return NextResponse.json({ briefs: enriched })
  } catch (error) {
    console.error('[API] GET /visibility/intel-brief error:', error)
    return NextResponse.json({ error: 'Failed to fetch intel briefs' }, { status: 500 })
  }
}

// POST /api/visibility/intel-brief - Generate new brief
export async function POST() {
  try {
    console.log('[API] Manual intel brief generation triggered')
    const result = await generateIntelBrief(prisma)
    return NextResponse.json({
      ...result,
      message: `Generated brief for ${result.weekStart} to ${result.weekEnd} (${result.extractionCount} extractions)`,
    })
  } catch (error) {
    console.error('[API] POST /visibility/intel-brief error:', error)
    return NextResponse.json({ error: 'Brief generation failed: ' + String(error) }, { status: 500 })
  }
}
