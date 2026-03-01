import { NextRequest, NextResponse } from 'next/server'
import { getCalendarClient } from '@/lib/calendar'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { summary, start, end, location, description } = body

    if (!summary) {
      return NextResponse.json({ error: 'summary is required' }, { status: 400 })
    }
    if (!start) {
      return NextResponse.json({ error: 'start datetime is required' }, { status: 400 })
    }

    const calendar = getCalendarClient()
    if (!calendar) {
      return NextResponse.json(
        { error: 'Google Calendar not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REFRESH_TOKEN.' },
        { status: 503 }
      )
    }

    // Build event payload
    const event: {
      summary: string
      start: { dateTime: string; timeZone: string }
      end: { dateTime: string; timeZone: string }
      location?: string
      description?: string
    } = {
      summary,
      start: {
        dateTime: start,
        timeZone: 'America/New_York',
      },
      end: {
        dateTime: end || start, // fallback to start if no end provided
        timeZone: 'America/New_York',
      },
    }

    if (location) event.location = location
    if (description) event.description = description

    const response = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: event,
    })

    return NextResponse.json({
      id: response.data.id,
      htmlLink: response.data.htmlLink,
      summary: response.data.summary,
      start: response.data.start,
      end: response.data.end,
    })
  } catch (error) {
    console.error('[Calendar] Failed to create event:', error)
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { error: `Failed to create calendar event: ${message}` },
      { status: 500 }
    )
  }
}
