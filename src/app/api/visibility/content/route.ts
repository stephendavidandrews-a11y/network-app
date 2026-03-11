import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// GET /api/visibility/content - List content items + pipeline stats
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const sourceType = searchParams.get('sourceType')
    const minScore = searchParams.get('minScore')
    const ingestionStatus = searchParams.get('ingestionStatus')
    const publication = searchParams.get('publication')
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    const where: Record<string, unknown> = {}
    if (sourceType) where.sourceType = sourceType
    if (minScore) where.topicRelevanceScore = { gte: parseInt(minScore) }
    if (ingestionStatus) where.ingestionStatus = ingestionStatus
    else where.ingestionStatus = { in: ['fetched', 'extracted'] }
    if (publication) where.publication = { contains: publication }

    const [items, total, contentStats, pipelineStats] = await Promise.all([
      prisma.contentItem.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        select: {
          id: true,
          sourceType: true,
          title: true,
          publication: true,
          publishedAt: true,
          sourceUrl: true,
          wordCount: true,
          ingestionStatus: true,
          summary: true,
          topicRelevanceScore: true,
          topicTags: true,
          createdAt: true,
          _count: { select: { extractions: true } },
        },
      }),
      prisma.contentItem.count({ where }),
      // Content item status breakdown
      prisma.contentItem.groupBy({
        by: ['ingestionStatus'],
        _count: { ingestionStatus: true },
      }),
      // Full pipeline stats — how many Intel discoveries at each stage
      Promise.all([
        prisma.discoveredEvent.count({
          where: { status: 'new', source: { name: { contains: '(Intel)' } } },
        }),
        prisma.discoveredEvent.count({
          where: { status: 'filtered', source: { name: { contains: '(Intel)' } } },
        }),
        prisma.contentItem.count({ where: { ingestionStatus: 'fetched' } }),
        prisma.contentItem.count({ where: { ingestionStatus: 'extracted' } }),
        prisma.contentExtraction.count(),
        prisma.discoveredEvent.count({
          where: { status: 'needs_fetch', source: { name: { contains: '(Intel)' } } },
        }),
      ]),
    ])

    const statusStats: Record<string, number> = {}
    for (const s of contentStats) {
      statusStats[s.ingestionStatus] = s._count.ingestionStatus
    }

    const enriched = items.map(item => ({
      ...item,
      topicTags: item.topicTags ? JSON.parse(item.topicTags) : [],
      extractionCount: item._count.extractions,
    }))

    return NextResponse.json({
      items: enriched,
      total,
      stats: statusStats,
      pipeline: {
        queued: pipelineStats[0],
        filtered: pipelineStats[1],
        fetched: pipelineStats[2],
        extracted: pipelineStats[3],
        extractions: pipelineStats[4],
        needsFetch: pipelineStats[5],
      },
    })
  } catch (error) {
    console.error('[API] GET /visibility/content error:', error)
    return NextResponse.json({ error: 'Failed to fetch content items' }, { status: 500 })
  }
}
