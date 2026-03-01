import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { classifyCalendarLoad } from '@/lib/calendar'
import type { CalendarDayData } from '@/types'

export async function GET() {
  try {
    const today = new Date().toISOString().split('T')[0]
    const cache = await prisma.calendarCache.findUnique({ where: { date: today } })

    if (!cache) {
      return NextResponse.json({
        meetings: [],
        meetingCount: 0,
        calendarLoad: 'light',
      })
    }

    const data: CalendarDayData = JSON.parse(cache.calendarData)
    const calendarLoad = classifyCalendarLoad(cache.meetingCount)

    return NextResponse.json({
      meetings: data.meetings,
      meetingCount: cache.meetingCount,
      calendarLoad,
    })
  } catch (error) {
    console.error('[Calendar API] Error fetching today:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
