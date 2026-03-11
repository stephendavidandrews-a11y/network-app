import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// GET /api/visibility/extractions - List extractions with filters
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const extractionType = searchParams.get('type')
    const processed = searchParams.get('processed')
    const topic = searchParams.get('topic')
    const minScore = searchParams.get('minScore')
    const limit = parseInt(searchParams.get('limit') || '100')
    const offset = parseInt(searchParams.get('offset') || '0')

    const where: Record<string, unknown> = {}
    if (extractionType) where.extractionType = extractionType
    if (processed !== null && processed !== undefined && processed !== '') {
      where.processed = processed === 'true'
    }
    if (topic) where.topic = { contains: topic }
    if (minScore) {
      where.contentItem = { topicRelevanceScore: { gte: parseInt(minScore) } }
    }

    const [extractions, total, byType] = await Promise.all([
      prisma.contentExtraction.findMany({
        where,
        include: {
          contentItem: {
            select: { title: true, publication: true, publishedAt: true, sourceUrl: true, topicRelevanceScore: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.contentExtraction.count({ where }),
      prisma.contentExtraction.groupBy({
        by: ['extractionType'],
        _count: { extractionType: true },
      }),
    ])

    const typeStats: Record<string, number> = {}
    for (const t of byType) {
      typeStats[t.extractionType] = t._count.extractionType
    }

    return NextResponse.json({ extractions, total, typeStats })
  } catch (error) {
    console.error('[API] GET /visibility/extractions error:', error)
    return NextResponse.json({ error: 'Failed to fetch extractions' }, { status: 500 })
  }
}
