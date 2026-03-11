import { PrismaClient } from '@prisma/client'
import { scrapeRSSSource } from './rss-parser'
import { scrapeHTMLSource } from './html-scraper'
import { scrapeFederalRegister } from './fed-register'
import { scrapeTribeAPI } from './tribe-api'

interface DiscoveryStats {
  sourcesProcessed: number
  totalDiscovered: number
  totalSkipped: number
  errors: Array<{ sourceName: string; error: string }>
}

export async function runDiscovery(prisma: PrismaClient): Promise<DiscoveryStats> {
  const now = new Date()
  const stats: DiscoveryStats = {
    sourcesProcessed: 0,
    totalDiscovered: 0,
    totalSkipped: 0,
    errors: [],
  }

  // Get all enabled sources
  const sources = await prisma.eventSource.findMany({
    where: { enabled: true },
  })

  for (const source of sources) {
    // Check frequency: should we scrape today?
    if (source.lastScrapedAt && !shouldScrapeToday(source.scrapeFrequency, source.lastScrapedAt, now)) {
      continue
    }

    console.log(`[Discovery] Scraping: ${source.name} (${source.sourceType})`)

    const config = JSON.parse(source.parserConfig || '{}')
    let result: { discovered: number; skipped: number; error?: string }

    try {
      switch (source.sourceType) {
        case 'rss':
          result = await scrapeRSSSource(prisma, source.id, source.url, config)
          break
        case 'scrape':
          result = await scrapeHTMLSource(prisma, source.id, source.url, config)
          break
        case 'api':
          result = await scrapeFederalRegister(prisma, source.id, source.url, config)
          break
        case 'tribe_api':
          result = await scrapeTribeAPI(prisma, source.id, source.url, config)
          break
        default:
          console.log(`[Discovery] Skipping ${source.name}: sourceType '${source.sourceType}' not implemented`)
          continue
      }

      // Update source metadata
      await prisma.eventSource.update({
        where: { id: source.id },
        data: {
          lastScrapedAt: now.toISOString(),
          lastResultCount: result.discovered,
          lastError: result.error || null,
        },
      })

      stats.sourcesProcessed++
      stats.totalDiscovered += result.discovered
      stats.totalSkipped += result.skipped

      if (result.error) {
        stats.errors.push({ sourceName: source.name, error: result.error })
      }

      console.log(`[Discovery]   -> ${result.discovered} new, ${result.skipped} skipped${result.error ? `, error: ${result.error}` : ''}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      stats.errors.push({ sourceName: source.name, error: message })
      console.error(`[Discovery]   -> FAILED: ${message}`)

      await prisma.eventSource.update({
        where: { id: source.id },
        data: {
          lastScrapedAt: now.toISOString(),
          lastError: message,
        },
      })
    }
  }

  return stats
}

function shouldScrapeToday(frequency: string, lastScrapedAt: string, now: Date): boolean {
  const last = new Date(lastScrapedAt)
  const hoursSince = (now.getTime() - last.getTime()) / (1000 * 60 * 60)

  switch (frequency) {
    case 'daily':
      return hoursSince >= 20
    case 'weekly':
      return hoursSince >= 144
    case 'biweekly':
      return hoursSince >= 312
    case 'monthly':
      return hoursSince >= 648
    default:
      return hoursSince >= 20
  }
}
