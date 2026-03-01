import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { assembleContactContext, generatePrepBrief } from '@/lib/meeting-prep'

// GET: Retrieve cached prep brief
export async function GET(request: NextRequest) {
  const contactId = request.nextUrl.searchParams.get('contactId')
  const date = request.nextUrl.searchParams.get('date') || new Date().toISOString().split('T')[0]

  if (!contactId) {
    return NextResponse.json({ error: 'contactId is required' }, { status: 400 })
  }

  const prep = await prisma.meetingPrep.findFirst({
    where: { contactId, date },
    orderBy: { generatedAt: 'desc' },
  })

  if (!prep) {
    return NextResponse.json({ exists: false })
  }

  return NextResponse.json({
    exists: true,
    prep: {
      id: prep.id,
      date: prep.date,
      contactId: prep.contactId,
      calendarEventId: prep.calendarEventId,
      meetingTitle: prep.meetingTitle,
      briefContent: prep.briefContent,
      generatedAt: prep.generatedAt,
    },
  })
}

// POST: Generate a new prep brief
export async function POST(request: NextRequest) {
  const body = await request.json()
  const { contactId, calendarEventId, meetingTitle, meetingTime } = body

  if (!contactId) {
    return NextResponse.json({ error: 'contactId is required' }, { status: 400 })
  }

  const contact = await prisma.contact.findUnique({ where: { id: contactId } })
  if (!contact) {
    return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
  }

  try {
    const context = await assembleContactContext(prisma, contactId, meetingTitle, meetingTime)
    const briefContent = await generatePrepBrief(context)

    const today = new Date().toISOString().split('T')[0]

    const prep = await prisma.meetingPrep.create({
      data: {
        date: today,
        contactId,
        calendarEventId: calendarEventId || null,
        meetingTitle: meetingTitle || null,
        briefContent,
      },
    })

    return NextResponse.json({
      exists: true,
      prep: {
        id: prep.id,
        date: prep.date,
        contactId: prep.contactId,
        calendarEventId: prep.calendarEventId,
        meetingTitle: prep.meetingTitle,
        briefContent: prep.briefContent,
        generatedAt: prep.generatedAt,
      },
    }, { status: 201 })
  } catch (error) {
    console.error('[MeetingPrep] Generation failed:', error)
    return NextResponse.json(
      { error: 'Failed to generate meeting prep brief' },
      { status: 500 }
    )
  }
}
