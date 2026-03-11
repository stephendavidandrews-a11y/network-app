import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { runCadenceCheck } from '@/lib/jobs/cadence-check'
import { runScoreUpdate } from '@/lib/jobs/score-update'
import { generateDailyBriefing } from '@/lib/jobs/daily-briefing'
import { runDbBackup } from '@/lib/jobs/db-backup'
import { runCalendarSync } from '@/lib/jobs/calendar-sync'
import { runMeetingPrepGenerate } from '@/lib/jobs/meeting-prep-generate'
import { runEmailPoll } from '@/lib/jobs/email-poll'
import { runPodcastMonitor } from '@/lib/visibility/podcast-monitor'
import { runEventDiscovery, runEventClassification, runContentTriage, runNeedsFetchRetriage } from '@/lib/jobs/event-discovery'
import { fetchIntelContent } from '@/lib/visibility/content-fetcher'
import { extractIntelContent } from '@/lib/visibility/content-extractor'
import { runPathwayScorer } from '@/lib/jobs/pathway-scorer'

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
      case 'email_poll': {
        const result = await runEmailPoll()
        return NextResponse.json({ job, result })
      }
          case 'podcast_monitor': {
      const result = await runPodcastMonitor(prisma)
      return NextResponse.json({ job, result })
    }
    case 'event_discovery': {
      const result = await runEventDiscovery(prisma)
      return NextResponse.json({ job, result })
    }
    case 'event_classification': {
      const result = await runEventClassification(prisma)
      return NextResponse.json({ job, result })
    }
    case 'content_triage': {
      const result = await runContentTriage(prisma)
      return NextResponse.json({ job, result })
    }
    case 'content_ingestion': {
      const result = await fetchIntelContent(prisma)
      return NextResponse.json({ job, result })
    }
    case 'content_extraction': {
      const result = await extractIntelContent(prisma)
      return NextResponse.json({ job, result })
    }
    case 'needs_fetch_retriage': {
      const result = await runNeedsFetchRetriage(prisma)
      return NextResponse.json({ job, result })
    }
    case 'pathway_scorer': {
      const result = await runPathwayScorer(prisma)
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
