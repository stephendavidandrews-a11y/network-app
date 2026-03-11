import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// GET /api/visibility/discovered - List discovered events with filters
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const sourceId = searchParams.get('sourceId')
    const minScore = searchParams.get('minScore')
    const limit = parseInt(searchParams.get('limit') || '50')
    const includeIntel = searchParams.get('includeIntel') === 'true'

    const where: Record<string, unknown> = {}
    if (status && status !== 'all') where.status = status
    if (sourceId) where.sourceId = sourceId
    if (minScore) where.topicRelevanceScore = { gte: parseInt(minScore) }

    // By default, exclude discoveries from Intel sources (news/blog feeds)
    // These will be shown in a separate Intel tab in V2
    if (!includeIntel) {
      where.source = { name: { not: { contains: '(Intel)' } } }
    }

    const [events, statsRaw] = await Promise.all([
      prisma.discoveredEvent.findMany({
        where,
        include: { source: { select: { name: true, category: true } } },
        orderBy: { scrapedAt: 'desc' },
        take: limit,
      }),
      // Stats also filtered to exclude Intel sources
      prisma.discoveredEvent.groupBy({
        by: ['status'],
        where: includeIntel ? {} : { source: { name: { not: { contains: '(Intel)' } } } },
        _count: { status: true },
      }),
    ])

    const stats: Record<string, number> = {}
    for (const row of statsRaw) {
      stats[row.status] = row._count.status
    }

    const enriched = events.map(e => ({
      ...e,
      sourceName: e.source.name,
      sourceCategory: e.source.category,
    }))

    return NextResponse.json({ events: enriched, stats })
  } catch (error) {
    console.error('[API] GET /visibility/discovered error:', error)
    return NextResponse.json({ error: 'Failed to fetch discovered events' }, { status: 500 })
  }
}

// POST /api/visibility/discovered - Manual entry
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { sourceId, rawTitle, rawDescription, rawDate, rawLocation, rawUrl } = body

    if (!sourceId || !rawTitle) {
      return NextResponse.json({ error: 'sourceId and rawTitle are required' }, { status: 400 })
    }

    const event = await prisma.discoveredEvent.create({
      data: {
        sourceId,
        rawTitle,
        rawDescription: rawDescription || null,
        rawDate: rawDate || null,
        rawLocation: rawLocation || null,
        rawUrl: rawUrl || null,
        status: 'new',
      },
    })

    return NextResponse.json(event, { status: 201 })
  } catch (error) {
    console.error('[API] POST /visibility/discovered error:', error)
    return NextResponse.json({ error: 'Failed to create discovered event' }, { status: 500 })
  }
}
