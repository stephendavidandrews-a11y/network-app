import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { contactId, action, suggestedRing } = body as {
      contactId: string
      action: 'accept' | 'dismiss'
      suggestedRing?: string
    }

    if (!contactId || !action) {
      return NextResponse.json(
        { error: 'contactId and action are required' },
        { status: 400 }
      )
    }

    if (action === 'accept') {
      if (!suggestedRing) {
        return NextResponse.json(
          { error: 'suggestedRing is required for accept action' },
          { status: 400 }
        )
      }

      await prisma.contact.update({
        where: { id: contactId },
        data: {
          personalRing: suggestedRing,
          ringSuggestionDismissed: null, // Clear any previous dismissal
        },
      })

      return NextResponse.json({ success: true, action: 'accepted', newRing: suggestedRing })
    }

    if (action === 'dismiss') {
      await prisma.contact.update({
        where: { id: contactId },
        data: {
          ringSuggestionDismissed: new Date(),
        },
      })

      return NextResponse.json({ success: true, action: 'dismissed' })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (error) {
    console.error('Ring suggestion error:', error)
    return NextResponse.json(
      { error: 'Failed to process ring suggestion' },
      { status: 500 }
    )
  }
}
