import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const sources = await prisma.eventSource.findMany({
      orderBy: [{ enabled: 'desc' }, { category: 'asc' }, { name: 'asc' }],
    })

    const enriched = sources.map(s => ({
      ...s,
      topicFilters: JSON.parse(s.topicFilters || '[]'),
      parserConfig: JSON.parse(s.parserConfig || '{}'),
    }))

    return NextResponse.json(enriched)
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, url, sourceType, category, scrapeFrequency, topicFilters, parserConfig, notes } = body

    if (!name || !url || !sourceType || !category) {
      return NextResponse.json({ error: 'name, url, sourceType, and category are required' }, { status: 400 })
    }

    const source = await prisma.eventSource.create({
      data: {
        name,
        url,
        sourceType,
        category,
        scrapeFrequency: scrapeFrequency || 'weekly',
        topicFilters: JSON.stringify(topicFilters || []),
        parserConfig: JSON.stringify(parserConfig || {}),
        notes: notes || null,
      },
    })

    return NextResponse.json(source, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
