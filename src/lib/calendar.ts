import { google, calendar_v3 } from 'googleapis'
import { prisma } from './db'
import type { CalendarMeeting, CalendarDayData, CalendarLoad } from '@/types'

// ── OAuth2 Client ──

export function getCalendarClient(): calendar_v3.Calendar | null {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN

  if (!clientId || !clientSecret || !refreshToken) {
    return null
  }

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret)
  oauth2Client.setCredentials({ refresh_token: refreshToken })

  return google.calendar({ version: 'v3', auth: oauth2Client })
}

// ── Fetch Today's Meetings ──

export async function fetchTodaysMeetings(): Promise<CalendarDayData> {
  const calendar = getCalendarClient()
  if (!calendar) {
    throw new Error('Google Calendar not configured')
  }

  const today = new Date()
  const dateStr = today.toISOString().split('T')[0]

  // Use Eastern Time for DC-based user
  const timeMin = new Date(`${dateStr}T00:00:00-05:00`)
  const timeMax = new Date(`${dateStr}T23:59:59-05:00`)

  const response = await calendar.events.list({
    calendarId: 'primary',
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
    maxResults: 50,
  })

  const events = response.data.items || []

  const meetings: CalendarMeeting[] = events
    .filter(event => {
      // Exclude all-day events (holidays, reminders)
      return event.start?.dateTime != null
    })
    .map(event => ({
      id: event.id || '',
      summary: event.summary || '(No title)',
      start: event.start?.dateTime || '',
      end: event.end?.dateTime || '',
      location: event.location || null,
      attendees: (event.attendees || []).map(a => ({
        email: a.email || '',
        displayName: a.displayName || null,
        responseStatus: a.responseStatus || 'needsAction',
      })),
      matchedContactId: null,
      matchedContactName: null,
      matchedContactTier: null,
      linkedEventId: null,
      linkedEventName: null,
    }))

  // Match attendees to contacts
  await matchAttendeesToContacts(meetings)

  // Link meetings to tracked events
  await linkMeetingsToEvents(meetings)

  return {
    date: dateStr,
    meetings,
    meetingCount: meetings.length,
    fetchedAt: new Date().toISOString(),
  }
}

// ── Contact Matching ──

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(jr|sr|iii|ii|iv|phd|md|esq|dr|mr|ms|mrs)\b\.?/gi, '')
    .replace(/[^a-z\s]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
}

async function matchAttendeesToContacts(meetings: CalendarMeeting[]): Promise<void> {
  const contacts = await prisma.contact.findMany({
    select: { id: true, name: true, email: true, tier: true },
  })

  // Build lookup maps
  const emailMap = new Map<string, typeof contacts[0]>()
  const nameMap = new Map<string, typeof contacts[0]>()

  for (const contact of contacts) {
    if (contact.email) {
      emailMap.set(contact.email.toLowerCase(), contact)
    }
    const normalized = normalizeName(contact.name)
    if (normalized) {
      nameMap.set(normalized, contact)
    }
  }

  for (const meeting of meetings) {
    let bestMatch: typeof contacts[0] | null = null
    let bestTier = 4 // Lower tier number = higher priority

    for (const attendee of meeting.attendees) {
      let matched: typeof contacts[0] | undefined

      // Layer 1: Email exact match
      if (attendee.email) {
        matched = emailMap.get(attendee.email.toLowerCase())
      }

      // Layer 2: Name match
      if (!matched && attendee.displayName) {
        const normalized = normalizeName(attendee.displayName)
        matched = nameMap.get(normalized)
      }

      // Keep highest-tier (lowest number) match
      if (matched && matched.tier < bestTier) {
        bestMatch = matched
        bestTier = matched.tier
      }
    }

    if (bestMatch) {
      meeting.matchedContactId = bestMatch.id
      meeting.matchedContactName = bestMatch.name
      meeting.matchedContactTier = bestMatch.tier
    }
  }
}

// ── Event Linking (Pre-Meeting Detection) ──

async function linkMeetingsToEvents(meetings: CalendarMeeting[]): Promise<void> {
  // Only check meetings that have a matched contact
  const matchedMeetings = meetings.filter(m => m.matchedContactId)
  if (matchedMeetings.length === 0) return

  // Get upcoming events within 7 days
  const today = new Date()
  const weekOut = new Date()
  weekOut.setDate(today.getDate() + 7)

  const events = await prisma.event.findMany({
    where: {
      dateStart: {
        gte: today.toISOString().split('T')[0],
        lte: weekOut.toISOString().split('T')[0],
      },
    },
    select: {
      id: true,
      name: true,
      contactsAttending: true,
      contactsSpeaking: true,
    },
  })

  for (const meeting of matchedMeetings) {
    for (const event of events) {
      let attending: string[] = []
      let speaking: string[] = []
      try { attending = JSON.parse(event.contactsAttending) } catch { /* empty */ }
      try { speaking = JSON.parse(event.contactsSpeaking) } catch { /* empty */ }

      const allEventContacts = [...attending, ...speaking]
      if (allEventContacts.includes(meeting.matchedContactId!)) {
        meeting.linkedEventId = event.id
        meeting.linkedEventName = event.name
        break
      }
    }
  }
}

// ── Connection Test ──

export async function testCalendarConnection(): Promise<{
  connected: boolean
  email: string | null
  error: string | null
}> {
  const calendar = getCalendarClient()
  if (!calendar) {
    return { connected: false, email: null, error: 'Google Calendar credentials not configured in environment variables' }
  }

  try {
    const response = await calendar.calendarList.get({ calendarId: 'primary' })
    return {
      connected: true,
      email: response.data.id || null,
      error: null,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[Calendar] Connection test failed:', message)
    return { connected: false, email: null, error: message }
  }
}

// ── Calendar Load Classification ──

export function classifyCalendarLoad(meetingCount: number): CalendarLoad {
  if (meetingCount <= 2) return 'light'
  if (meetingCount <= 4) return 'normal'
  return 'heavy'
}

export function getOutreachCap(load: CalendarLoad): number {
  switch (load) {
    case 'light': return 5
    case 'normal': return 3
    case 'heavy': return 2
  }
}
