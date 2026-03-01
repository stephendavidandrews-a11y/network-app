import { PrismaClient } from '@prisma/client'
import { fetchTodaysMeetings } from '../calendar'

export async function runCalendarSync(prisma: PrismaClient): Promise<{ date: string; meetingCount: number }> {
  // Skip if Google Calendar is not configured
  if (!process.env.GOOGLE_REFRESH_TOKEN) {
    console.log('[Calendar Sync] Google Calendar not configured, skipping')
    return { date: new Date().toISOString().split('T')[0], meetingCount: 0 }
  }

  const data = await fetchTodaysMeetings()

  // Upsert today's cache
  await prisma.calendarCache.upsert({
    where: { date: data.date },
    update: {
      calendarData: JSON.stringify(data),
      meetingCount: data.meetingCount,
      fetchedAt: new Date().toISOString(),
    },
    create: {
      date: data.date,
      calendarData: JSON.stringify(data),
      meetingCount: data.meetingCount,
    },
  })

  // Clean old cache entries (keep last 30 days)
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  await prisma.calendarCache.deleteMany({
    where: { date: { lt: thirtyDaysAgo.toISOString().split('T')[0] } },
  })

  console.log(`[Calendar Sync] Cached ${data.meetingCount} meetings for ${data.date}`)
  return { date: data.date, meetingCount: data.meetingCount }
}
