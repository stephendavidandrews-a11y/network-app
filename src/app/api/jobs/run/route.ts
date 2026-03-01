import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { runCadenceCheck } from '@/lib/jobs/cadence-check'
import { runScoreUpdate } from '@/lib/jobs/score-update'
import { generateDailyBriefing } from '@/lib/jobs/daily-briefing'

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
      case 'all': {
        const scores = await runScoreUpdate(prisma)
        const cadence = await runCadenceCheck(prisma)
        const briefing = await generateDailyBriefing(prisma)
        return NextResponse.json({
          job: 'all',
          results: {
            scores: { updated: scores.updated },
            cadence: { generated: cadence.generated },
            briefing: { date: briefing.date },
          },
        })
      }
      default:
        return NextResponse.json({ error: `Unknown job: ${job}` }, { status: 400 })
    }
  } catch (error) {
    console.error(`Job ${job} failed:`, error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
