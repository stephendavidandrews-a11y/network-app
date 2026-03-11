import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { contactId, action, suggestedFunnel } = body

    if (!contactId || !action) {
      return NextResponse.json({ error: 'contactId and action required' }, { status: 400 })
    }

    if (action === 'accept') {
      if (!suggestedFunnel) {
        return NextResponse.json({ error: 'suggestedFunnel required for accept' }, { status: 400 })
      }
      await prisma.contact.update({
        where: { id: contactId },
        data: {
          funnelStage: suggestedFunnel,
          funnelSuggestionDismissed: null,
        },
      })
      return NextResponse.json({ success: true, funnelStage: suggestedFunnel })
    }

    if (action === 'dismiss') {
      await prisma.contact.update({
        where: { id: contactId },
        data: {
          funnelSuggestionDismissed: new Date(),
        },
      })
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (error) {
    console.error('[Funnel Suggestion] POST error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
