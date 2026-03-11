import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': 'https://stephenandrews.org',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

export async function GET(request: NextRequest) {
  try {
    const today = new Date().toISOString().split('T')[0]

    // Query SocialPlan (unified model replacing SocialEvent)
    const plans = await prisma.socialPlan.findMany({
      where: {
        publicVisibility: true,
        targetDate: { gte: today },
        status: { in: ['approved', 'invites_sent', 'confirmed'] },
      },
      select: {
        id: true,
        title: true,
        targetDate: true,
        time: true,
        location: true,
        description: true,
        planType: true,
      },
      orderBy: { targetDate: 'asc' },
    })

    // Map field names for backwards compatibility with stephenandrews.org
    const events = plans.map(p => ({
      id: p.id,
      title: p.title,
      date: p.targetDate,
      time: p.time,
      location: p.location,
      description: p.description,
      eventType: p.planType,
    }))

    return NextResponse.json(events, { headers: CORS_HEADERS })
  } catch (error) {
    console.error('[Public Events] GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: CORS_HEADERS })
  }
}
