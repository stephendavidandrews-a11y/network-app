import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// GET /api/intel/filtered — recently filtered items for false-negative review
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const days = parseInt(searchParams.get('days') || '7')
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

    const [items, total] = await Promise.all([
      prisma.discoveredEvent.findMany({
        where: {
          status: 'filtered',
          source: { name: { contains: '(Intel)' } },
          scrapedAt: { gte: cutoff },
        },
        include: { source: { select: { name: true, category: true } } },
        orderBy: { scrapedAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.discoveredEvent.count({
        where: {
          status: 'filtered',
          source: { name: { contains: '(Intel)' } },
          scrapedAt: { gte: cutoff },
        },
      }),
    ])

    const enriched = items.map(e => ({
      id: e.id,
      title: e.rawTitle,
      description: e.rawDescription?.substring(0, 200) || null,
      url: e.rawUrl,
      source: e.source.name.replace(' (Intel)', ''),
      category: e.source.category,
      score: e.topicRelevanceScore,
      reason: e.dismissedReason,
      scrapedAt: e.scrapedAt,
    }))

    return NextResponse.json({ items: enriched, total })
  } catch (error) {
    console.error('[API] GET /api/intel/filtered error:', error)
    return NextResponse.json({ error: 'Failed to fetch filtered items' }, { status: 500 })
  }
}
