import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': 'https://stephenandrews.org',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, phone, howKnowMe, eventId } = body

    // Validate required fields
    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400, headers: CORS_HEADERS })
    }
    if (!phone || !phone.trim()) {
      return NextResponse.json({ error: 'Phone is required' }, { status: 400, headers: CORS_HEADERS })
    }

    // Validate phone has at least 10 digits
    const digits = phone.replace(/\D/g, '')
    if (digits.length < 10) {
      return NextResponse.json({ error: 'Phone must have at least 10 digits' }, { status: 400, headers: CORS_HEADERS })
    }

    // Validate eventId exists if provided (now stored as a SocialPlan)
    if (eventId) {
      const plan = await prisma.socialPlan.findUnique({ where: { id: eventId } })
      if (!plan) {
        return NextResponse.json({ error: 'Event not found' }, { status: 400, headers: CORS_HEADERS })
      }
    }

    const inviteRequest = await prisma.inviteRequest.create({
      data: {
        name: name.trim(),
        phone: phone.trim(),
        howKnowMe: howKnowMe?.trim() || null,
        eventId: eventId || null,
      },
    })

    return NextResponse.json({ success: true, id: inviteRequest.id }, { status: 201, headers: CORS_HEADERS })
  } catch (error) {
    console.error('[Invite Request] POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: CORS_HEADERS })
  }
}
