/**
 * POST /api/inbox/[id]/dismiss
 *
 * Dismisses an ingestion item without writing anything to the database.
 * Optionally accepts a reason for training the learning system.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    let reason: string | null = null
    try {
      const body = await request.json()
      reason = body.reason || null
    } catch {
      // No body is fine
    }

    const item = await prisma.ingestionItem.findUnique({
      where: { id },
      select: { id: true, status: true },
    })

    if (!item) {
      return NextResponse.json({ error: 'Ingestion item not found' }, { status: 404 })
    }

    if (item.status !== 'pending') {
      return NextResponse.json({ error: `Item is already ${item.status}` }, { status: 400 })
    }

    await prisma.ingestionItem.update({
      where: { id },
      data: {
        status: 'dismissed',
        dismissReason: reason,
        reviewedAt: new Date().toISOString(),
      },
    })

    // Log learning signal
    await prisma.learningSignal.create({
      data: {
        ingestionItemId: id,
        action: 'dismissed',
        dismissReason: reason,
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Inbox] Dismiss error:', error)
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
