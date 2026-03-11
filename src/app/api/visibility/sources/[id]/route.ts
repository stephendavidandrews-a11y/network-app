import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const source = await prisma.eventSource.findUnique({ where: { id } })
    if (!source) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    return NextResponse.json({
      ...source,
      topicFilters: JSON.parse(source.topicFilters || '[]'),
      parserConfig: JSON.parse(source.parserConfig || '{}'),
    })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const body = await request.json()
    const updateData: Record<string, unknown> = {}

    if (body.name !== undefined) updateData.name = body.name
    if (body.url !== undefined) updateData.url = body.url
    if (body.sourceType !== undefined) updateData.sourceType = body.sourceType
    if (body.category !== undefined) updateData.category = body.category
    if (body.scrapeFrequency !== undefined) updateData.scrapeFrequency = body.scrapeFrequency
    if (body.enabled !== undefined) updateData.enabled = body.enabled
    if (body.notes !== undefined) updateData.notes = body.notes
    if (body.topicFilters !== undefined) updateData.topicFilters = JSON.stringify(body.topicFilters)
    if (body.parserConfig !== undefined) updateData.parserConfig = JSON.stringify(body.parserConfig)

    const source = await prisma.eventSource.update({
      where: { id },
      data: updateData,
    })

    return NextResponse.json(source)
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    await prisma.discoveredEvent.deleteMany({ where: { sourceId: id } })
    await prisma.eventSource.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

// POST = trigger manual scrape for this source
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const source = await prisma.eventSource.findUnique({ where: { id } })
    if (!source) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // Import and use individual parsers
    const { scrapeRSSSource } = await import('@/lib/visibility/rss-parser')
    const { scrapeHTMLSource } = await import('@/lib/visibility/html-scraper')
    const { scrapeFederalRegister } = await import('@/lib/visibility/fed-register')
    const { scrapeTribeAPI } = await import('@/lib/visibility/tribe-api')

    const config = JSON.parse(source.parserConfig || '{}')
    let result: { discovered: number; skipped: number; error?: string }

    switch (source.sourceType) {
      case 'rss':
        result = await scrapeRSSSource(prisma, source.id, source.url, config)
        break
      case 'scrape':
        result = await scrapeHTMLSource(prisma, source.id, source.url, config)
        break
      case 'api':
        result = await scrapeFederalRegister(prisma, source.id, source.url, config)
        break
      case 'tribe_api':
        result = await scrapeTribeAPI(prisma, source.id, source.url, config)
        break
      default:
        return NextResponse.json({ error: `Unsupported sourceType: ${source.sourceType}` }, { status: 400 })
    }

    // Update source metadata
    await prisma.eventSource.update({
      where: { id },
      data: {
        lastScrapedAt: new Date().toISOString(),
        lastResultCount: result.discovered,
        lastError: result.error || null,
      },
    })

    return NextResponse.json({
      source: source.name,
      discovered: result.discovered,
      skipped: result.skipped,
      error: result.error || null,
    })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
