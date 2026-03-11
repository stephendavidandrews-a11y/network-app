import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// POST /api/intel/feedback — create triage feedback
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { discoveredEventId, contentItemId, feedbackType, reason } = body

    if (!feedbackType || (!discoveredEventId && !contentItemId)) {
      return NextResponse.json({ error: 'feedbackType and (discoveredEventId or contentItemId) required' }, { status: 400 })
    }

    if (!['false_positive', 'false_negative'].includes(feedbackType)) {
      return NextResponse.json({ error: 'feedbackType must be false_positive or false_negative' }, { status: 400 })
    }

    let eventId = discoveredEventId
    let eventTitle = ''
    let sourceName = ''
    let sourceCategory = ''
    let originalScore: number | null = null

    if (contentItemId && !discoveredEventId) {
      // Look up the ContentItem, then find matching DiscoveredEvent by URL
      const item = await prisma.contentItem.findUnique({ where: { id: contentItemId } })
      if (!item) return NextResponse.json({ error: 'ContentItem not found' }, { status: 404 })

      eventTitle = item.title
      sourceName = item.publication || 'Unknown'
      sourceCategory = item.sourceType
      originalScore = item.topicRelevanceScore ? Math.round(item.topicRelevanceScore) : null

      if (item.sourceUrl) {
        const event = await prisma.discoveredEvent.findFirst({
          where: { rawUrl: item.sourceUrl },
          include: { source: { select: { name: true, category: true } } },
        })
        if (event) {
          eventId = event.id
          sourceName = event.source.name.replace(' (Intel)', '')
          sourceCategory = event.source.category
        }
      }
    } else {
      const event = await prisma.discoveredEvent.findUnique({
        where: { id: eventId },
        include: { source: { select: { name: true, category: true } } },
      })
      if (!event) return NextResponse.json({ error: 'DiscoveredEvent not found' }, { status: 404 })
      eventTitle = event.rawTitle
      sourceName = event.source.name.replace(' (Intel)', '')
      sourceCategory = event.source.category
      originalScore = event.topicRelevanceScore ? Math.round(event.topicRelevanceScore) : null
    }

    const feedback = await prisma.triageFeedback.create({
      data: {
        discoveredEventId: eventId || 'unknown',
        feedbackType,
        title: eventTitle,
        sourceCategory,
        sourceName,
        originalScore,
        reason: reason || null,
      },
    })

    // If false_negative, re-queue the item for triage
    if (feedbackType === 'false_negative' && eventId) {
      await prisma.discoveredEvent.update({
        where: { id: eventId },
        data: { status: 'triaged', dismissedReason: null },
      })
    }

    return NextResponse.json({ feedback, message: feedbackType === 'false_negative' ? 'Item re-queued for ingestion' : 'Feedback recorded' })
  } catch (error) {
    console.error('[API] POST /api/intel/feedback error:', error)
    return NextResponse.json({ error: 'Failed to create feedback' }, { status: 500 })
  }
}

// GET /api/intel/feedback — list recent feedback
export async function GET() {
  try {
    const feedback = await prisma.triageFeedback.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
    return NextResponse.json({ feedback })
  } catch (error) {
    console.error('[API] GET /api/intel/feedback error:', error)
    return NextResponse.json({ error: 'Failed to fetch feedback' }, { status: 500 })
  }
}
