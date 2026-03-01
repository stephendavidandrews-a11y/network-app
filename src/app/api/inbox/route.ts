/**
 * GET /api/inbox
 *
 * Returns pending ingestion items for the review queue.
 * Supports filtering by status and pagination.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status') || 'pending'
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100)
    const offset = parseInt(searchParams.get('offset') || '0')

    const where = status === 'all'
      ? {}
      : { status }

    const [items, total] = await Promise.all([
      prisma.ingestionItem.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        include: {
          contact: {
            select: {
              id: true,
              name: true,
              organization: true,
              tier: true,
            },
          },
        },
      }),
      prisma.ingestionItem.count({ where }),
    ])

    // Parse extraction JSON for each item
    const enriched = items.map(item => ({
      id: item.id,
      source: item.source,
      itemType: item.itemType,
      contactId: item.contactId,
      contactHint: item.contactHint,
      contactName: item.contact?.name || null,
      contactOrg: item.contact?.organization || null,
      contactTier: item.contact?.tier || null,
      status: item.status,
      sensitivityFlag: item.sensitivityFlag,
      clusterId: item.clusterId,
      autoHandled: item.autoHandled,
      confidence: item.confidence,
      createdAt: item.createdAt,
      reviewedAt: item.reviewedAt,
      extraction: safeParseJSON(item.extraction),
      manifest: item.manifest ? safeParseJSON(item.manifest) : null,
    }))

    // Stats
    const stats = await prisma.ingestionItem.groupBy({
      by: ['status'],
      _count: { id: true },
    })

    const statsMap: Record<string, number> = {}
    for (const s of stats) {
      statsMap[s.status] = s._count.id
    }

    return NextResponse.json({
      items: enriched,
      total,
      stats: {
        pending: statsMap['pending'] || 0,
        confirmed: statsMap['confirmed'] || 0,
        dismissed: statsMap['dismissed'] || 0,
        edited: statsMap['edited'] || 0,
        auto_handled: statsMap['auto_handled'] || 0,
      },
    })
  } catch (error) {
    console.error('[Inbox] Error:', error)
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

function safeParseJSON(str: string): unknown {
  try {
    return JSON.parse(str)
  } catch {
    return null
  }
}
