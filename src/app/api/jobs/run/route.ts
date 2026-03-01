import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { runCadenceCheck } from '@/lib/jobs/cadence-check'
import { runScoreUpdate } from '@/lib/jobs/score-update'
import { generateDailyBriefing } from '@/lib/jobs/daily-briefing'
import { runDbBackup } from '@/lib/jobs/db-backup'
import { runCalendarSync } from '@/lib/jobs/calendar-sync'
import { runMeetingPrepGenerate } from '@/lib/jobs/meeting-prep-generate'

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { job } = body

  try {
    switch (job) {
      case 'cadence_check': {
        const result = await runCadenceCheck(prisma)
        return NextResponse.json({ job, result })
      }
      case 'score_update': {
        const result = await runScoreUpdate(prisma)
        return NextResponse.json({ job, result })
      }
      case 'daily_briefing': {
        const result = await generateDailyBriefing(prisma)
        return NextResponse.json({ job, result: { date: result.date, overdueCount: result.overdueContacts.length } })
      }
      case 'calendar_sync': {
        const result = await runCalendarSync(prisma)
        return NextResponse.json({ job, result })
      }
      case 'meeting_prep': {
        const result = await runMeetingPrepGenerate(prisma)
        return NextResponse.json({ job, result })
      }
      case 'all': {
        const calendar = await runCalendarSync(prisma)
        const scores = await runScoreUpdate(prisma)
        const cadence = await runCadenceCheck(prisma)
        const briefing = await generateDailyBriefing(prisma)
        const meetingPreps = await runMeetingPrepGenerate(prisma)
        return NextResponse.json({
          job: 'all',
          results: {
            calendar: { meetingCount: calendar.meetingCount },
            scores: { updated: scores.updated },
            cadence: { generated: cadence.generated },
            briefing: { date: briefing.date },
            meetingPreps: { generated: meetingPreps.generated },
          },
        })
      }
      case 'db_backup': {
        const result = runDbBackup()
        return NextResponse.json({ job, result })
      }
      default:
        return NextResponse.json({ error: `Unknown job: ${job}` }, { status: 400 })
    }
  } catch (error) {
    console.error(`Job ${job} failed:`, error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
