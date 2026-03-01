import { PrismaClient } from '@prisma/client'
import { assembleContactContext, generatePrepBrief } from '../meeting-prep'
import { CalendarMeeting } from '@/types'

export async function runMeetingPrepGenerate(prisma: PrismaClient) {
  const today = new Date().toISOString().split('T')[0]

  // Read today's calendar cache
  const cache = await prisma.calendarCache.findUnique({
    where: { date: today },
  })

  if (!cache) {
    console.log('[MeetingPrep] No calendar cache for today, skipping')
    return { generated: 0, skipped: 0, date: today }
  }

  let meetings: CalendarMeeting[] = []
  try {
    const data = JSON.parse(cache.calendarData)
    meetings = data.meetings || data || []
  } catch {
    console.error('[MeetingPrep] Failed to parse calendar data')
    return { generated: 0, skipped: 0, date: today }
  }

  // Filter to meetings with matched contacts
  const matchedMeetings = meetings.filter(m => m.matchedContactId)

  let generated = 0
  let skipped = 0

  for (const meeting of matchedMeetings) {
    // Check if prep already exists for this contact today
    const existing = await prisma.meetingPrep.findFirst({
      where: { contactId: meeting.matchedContactId!, date: today },
    })

    if (existing) {
      skipped++
      continue
    }

    try {
      const context = await assembleContactContext(
        prisma,
        meeting.matchedContactId!,
        meeting.summary,
        meeting.start
      )
      const briefContent = await generatePrepBrief(context)

      await prisma.meetingPrep.create({
        data: {
          date: today,
          contactId: meeting.matchedContactId!,
          calendarEventId: meeting.id,
          meetingTitle: meeting.summary,
          briefContent,
        },
      })

      generated++
      console.log(`[MeetingPrep] Generated brief for ${meeting.matchedContactName} — ${meeting.summary}`)
    } catch (error) {
      console.error(`[MeetingPrep] Failed to generate brief for ${meeting.matchedContactName}:`, error)
      // Continue with next meeting
    }
  }

  return { generated, skipped, date: today }
}
