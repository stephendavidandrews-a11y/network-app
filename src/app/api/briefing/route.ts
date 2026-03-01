import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { generateDailyBriefing } from '@/lib/jobs/daily-briefing'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const date = searchParams.get('date') || new Date().toISOString().split('T')[0]

  // Try to fetch existing briefing
  const existing = await prisma.dailyBriefing.findUnique({
    where: { date },
  })

  if (existing) {
    try {
      return NextResponse.json(JSON.parse(existing.content))
    } catch {
      return NextResponse.json({ error: 'Invalid briefing data' }, { status: 500 })
    }
  }

  // If today and no briefing, generate one
  const today = new Date().toISOString().split('T')[0]
  if (date === today) {
    const briefing = await generateDailyBriefing(prisma)
    return NextResponse.json(briefing)
  }

  return NextResponse.json({ error: 'No briefing for this date' }, { status: 404 })
}
