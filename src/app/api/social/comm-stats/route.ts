import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// GET comm stats — optionally filtered by contactId, or get triage candidates
export async function GET(request: NextRequest) {
  try {
    const contactId = request.nextUrl.searchParams.get('contactId')
    const triage = request.nextUrl.searchParams.get('triage')
    const bucket = request.nextUrl.searchParams.get('bucket') // 'main' or 'warm_leads'
    const droppedOnly = request.nextUrl.searchParams.get('droppedOnly')

    // Single contact stats
    if (contactId) {
      const stats = await prisma.textContactCommStats.findFirst({
        where: { contactId },
      })
      return NextResponse.json(stats)
    }

    // Dropped balls
    if (droppedOnly === 'true') {
      const dropped = await prisma.textContactCommStats.findMany({
        where: {
          droppedBall: true,
          contactId: { not: null },
        },
        include: {
          contact: {
            select: {
              id: true, name: true, photoUrl: true,
              personalRing: true, contactType: true,
            },
          },
        },
        orderBy: { droppedBallSince: 'asc' },
      })
      return NextResponse.json(dropped)
    }

    // Triage candidates (bucket 2: have texts, not in network app)
    if (triage === 'true') {
      const minMessages = bucket === 'warm_leads' ? 3 : 20
      const maxMessages = bucket === 'warm_leads' ? 19 : undefined

      const where: Record<string, unknown> = {
        contactId: null,
        totalMessages: { gte: minMessages },
      }
      if (maxMessages) {
        where.totalMessages = { gte: minMessages, lte: maxMessages }
      }

      if (bucket === 'warm_leads') {
        const twelveMonthsAgo = new Date()
        twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12)
        const thirteenMonthsAgo = new Date()
        thirteenMonthsAgo.setMonth(thirteenMonthsAgo.getMonth() - 13)

        where.lastMessageDate = { gte: twelveMonthsAgo.toISOString() }
        where.firstMessageDate = { gte: thirteenMonthsAgo.toISOString() }
      }

      const candidates = await prisma.textContactCommStats.findMany({
        where,
        orderBy: { totalWeightedScore: 'desc' },
      })

      return NextResponse.json(candidates)
    }

    // Default: all stats with linked contacts
    const stats = await prisma.textContactCommStats.findMany({
      where: { contactId: { not: null } },
      include: {
        contact: {
          select: {
            id: true, name: true, photoUrl: true,
            personalRing: true, contactType: true,
          },
        },
      },
      orderBy: { totalWeightedScore: 'desc' },
    })

    return NextResponse.json(stats)
  } catch (error) {
    console.error('[Comm Stats] GET error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
