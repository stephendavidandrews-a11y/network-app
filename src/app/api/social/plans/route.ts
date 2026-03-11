import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { generatePlan } from '@/lib/planning-engine'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const status = searchParams.get('status')
    const planType = searchParams.get('planType')

    const where: Record<string, unknown> = {}
    if (status) where.status = status
    if (planType) where.planType = planType

    const plans = await prisma.socialPlan.findMany({
      where,
      include: {
        venue: { select: { id: true, name: true, venueType: true, city: true } },
      },
      orderBy: { targetDate: 'desc' },
    })

    // Parse JSON fields for client consumption
    const parsed = plans.map(p => ({
      ...p,
      suggestedContacts: JSON.parse(p.suggestedContacts || '[]'),
      alternativeVenueIds: JSON.parse(p.alternativeVenueIds || '[]'),
    }))

    return NextResponse.json(parsed)
  } catch (error) {
    console.error('[Plans] GET error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action, planType, targetDate } = body

    if (action === 'generate') {
      if (!planType || !targetDate) {
        return NextResponse.json(
          { error: 'planType and targetDate are required' },
          { status: 400 },
        )
      }

      const validTypes = ['happy_hour', 'golf', 'dinner', 'party']
      if (!validTypes.includes(planType)) {
        return NextResponse.json(
          { error: `Invalid planType. Must be one of: ${validTypes.join(', ')}` },
          { status: 400 },
        )
      }

      const result = await generatePlan(planType, targetDate)
      return NextResponse.json(result, { status: 201 })
    }

    if (action === 'create_manual') {
      if (!planType || !targetDate) {
        return NextResponse.json(
          { error: 'planType and targetDate are required' },
          { status: 400 },
        )
      }

      const { title, venueId, contactIds, notes } = body as {
        title?: string
        venueId?: string
        contactIds?: string[]
        notes?: string
      }

      // Build suggestedContacts from provided contactIds
      let suggestedContacts: Array<Record<string, unknown>> = []
      if (contactIds && contactIds.length > 0) {
        const contacts = await prisma.contact.findMany({
          where: { id: { in: contactIds } },
          select: { id: true, name: true, phone: true, personalRing: true, funnelStage: true },
        })
        suggestedContacts = contacts.map(c => ({
          contactId: c.id,
          name: c.name,
          phone: c.phone,
          ring: c.personalRing || 'new',
          funnelStage: c.funnelStage,
          score: 0,
          reasoning: 'manually added',
          hooks: [],
        }))
      }

      const plan = await prisma.socialPlan.create({
        data: {
          planType,
          targetDate,
          title: title || null,
          suggestedContacts: JSON.stringify(suggestedContacts),
          suggestedVenueId: venueId || null,
          notes: notes || null,
          status: 'pending',
        },
        include: {
          venue: { select: { id: true, name: true, venueType: true, city: true } },
        },
      })

      return NextResponse.json({
        ...plan,
        suggestedContacts: JSON.parse(plan.suggestedContacts),
        alternativeVenueIds: [],
      }, { status: 201 })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (error) {
    console.error('[Plans] POST error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
