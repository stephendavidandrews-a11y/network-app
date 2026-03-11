import { PrismaClient } from '@prisma/client'

interface TribeEvent {
  id: number
  url: string
  title: string
  description: string
  start_date: string
  end_date: string
  venue?: {
    venue: string
    city: string
    state: string
    country: string
  }
  categories?: Array<{ name: string }>
}

interface TribeAPIConfig {
  perPage?: number
}

export async function scrapeTribeAPI(
  prisma: PrismaClient,
  sourceId: string,
  url: string,
  config: TribeAPIConfig
): Promise<{ discovered: number; skipped: number; error?: string }> {
  let discovered = 0
  let skipped = 0

  try {
    const perPage = config.perPage || 20
    const apiUrl = `${url}?per_page=${perPage}&start_date=now`

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 20000)

    const response = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'NetworkIntel/1.0',
        'Accept': 'application/json',
      },
      signal: controller.signal,
    })
    clearTimeout(timeout)

    if (!response.ok) {
      return { discovered: 0, skipped: 0, error: `HTTP ${response.status}: ${response.statusText}` }
    }

    const data = await response.json()
    const events: TribeEvent[] = data.events || data || []

    if (!Array.isArray(events)) {
      return { discovered: 0, skipped: 0, error: 'API response is not an array of events' }
    }

    for (const item of events) {
      const rawTitle = item.title
        ?.replace(/<[^>]*>/g, '')
        .replace(/&#8211;?/g, '\u2013')
        .replace(/&#8212;?/g, '\u2014')
        .replace(/&#8216;?/g, '\u2018')
        .replace(/&#8217;?/g, '\u2019')
        .replace(/&#8220;?/g, '\u201c')
        .replace(/&#8221;?/g, '\u201d')
        .replace(/&#038;?/g, '&')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .trim()
      if (!rawTitle) continue

      const rawUrl = item.url || null
      const rawDate = item.start_date || null
      const rawDescription = item.description?.replace(/<[^>]*>/g, '').substring(0, 2000) || null

      let rawLocation: string | null = null
      if (item.venue) {
        const parts = [item.venue.venue, item.venue.city, item.venue.state, item.venue.country]
          .filter(Boolean)
        rawLocation = parts.join(', ') || null
      }

      // Dedup by URL
      if (rawUrl) {
        const existing = await prisma.discoveredEvent.findFirst({
          where: { sourceId, rawUrl },
        })
        if (existing) { skipped++; continue }
      }

      // Dedup by title
      const existingByTitle = await prisma.discoveredEvent.findFirst({
        where: { sourceId, rawTitle },
      })
      if (existingByTitle) { skipped++; continue }

      await prisma.discoveredEvent.create({
        data: {
          sourceId,
          rawTitle,
          rawDescription,
          rawDate,
          rawUrl,
          rawLocation,
          rawSpeakers: null,
          status: 'new',
        },
      })
      discovered++
    }

    return { discovered, skipped }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes('abort')) {
      return { discovered, skipped, error: 'API request timed out (20s)' }
    }
    return { discovered, skipped, error: message }
  }
}
