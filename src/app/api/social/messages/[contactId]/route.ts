import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// GET messages for a contact — recent texts for contact detail page
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ contactId: string }> }
) {
  try {
    const { contactId } = await params
    const limit = parseInt(request.nextUrl.searchParams.get('limit') || '50')
    const offset = parseInt(request.nextUrl.searchParams.get('offset') || '0')
    const groupFilter = request.nextUrl.searchParams.get('group') // '1:1' or 'all'

    const where: Record<string, unknown> = { contactId }
    if (groupFilter === '1:1') {
      where.isGroupMessage = false
    }

    const [messages, total] = await Promise.all([
      prisma.textMessage.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        take: limit,
        skip: offset,
        select: {
          id: true,
          direction: true,
          content: true,
          timestamp: true,
          isGroupMessage: true,
          groupSize: true,
          weight: true,
        },
      }),
      prisma.textMessage.count({ where }),
    ])

    return NextResponse.json({ messages, total })
  } catch (error) {
    console.error('[Messages] GET error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
