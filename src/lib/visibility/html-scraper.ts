import * as cheerio from 'cheerio'
import { PrismaClient } from '@prisma/client'

interface HTMLScraperConfig {
  containerSelector: string
  titleSelector: string
  dateSelector?: string
  locationSelector?: string
  linkSelector?: string
  descriptionSelector?: string
  speakersSelector?: string
  baseUrl?: string
}

export async function scrapeHTMLSource(
  prisma: PrismaClient,
  sourceId: string,
  url: string,
  config: HTMLScraperConfig
): Promise<{ discovered: number; skipped: number; error?: string }> {
  let discovered = 0
  let skipped = 0

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 25000)

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'identity',
      },
      signal: controller.signal,
      redirect: 'follow',
    })
    clearTimeout(timeout)

    if (!response.ok) {
      return { discovered: 0, skipped: 0, error: `HTTP ${response.status}: ${response.statusText}` }
    }

    const html = await response.text()

    if (html.length < 200) {
      return { discovered: 0, skipped: 0, error: 'Page returned very little content (possible block or redirect)' }
    }

    const $ = cheerio.load(html)
    const baseUrl = config.baseUrl || new URL(url).origin

    // Try each selector in the comma-separated list to find matching containers
    const elements = $(config.containerSelector).toArray()

    if (elements.length === 0) {
      // Try to figure out what happened
      const title = $('title').text().trim()
      return {
        discovered: 0,
        skipped: 0,
        error: `No elements matched selector "${config.containerSelector.substring(0, 60)}". Page title: "${title.substring(0, 60)}". Try updating CSS selectors.`,
      }
    }

    for (const el of elements) {
      const $el = $(el)

      // Get title - try titleSelector, then fall back to first heading or link text
      let rawTitle = $el.find(config.titleSelector).first().text().trim()
      if (!rawTitle) {
        rawTitle = $el.find('a').first().text().trim()
      }
      if (!rawTitle || rawTitle.length < 3) continue

      // Skip navigation links, footers, etc.
      if (rawTitle.toLowerCase().includes('view all') || rawTitle.toLowerCase().includes('load more')) continue

      const rawDate = config.dateSelector ? $el.find(config.dateSelector).first().text().trim() || null : null
      const rawLocation = config.locationSelector ? $el.find(config.locationSelector).first().text().trim() || null : null
      const rawDescription = config.descriptionSelector ? $el.find(config.descriptionSelector).first().text().trim()?.substring(0, 2000) || null : null
      const rawSpeakers = config.speakersSelector ? $el.find(config.speakersSelector).first().text().trim() || null : null

      let rawUrl: string | null = null
      const linkSel = config.linkSelector || 'a'
      const href = $el.find(linkSel).attr('href') || $el.find('a').first().attr('href')
      if (href) {
        if (href.startsWith('http')) {
          rawUrl = href
        } else if (href.startsWith('/')) {
          rawUrl = `${baseUrl}${href}`
        } else if (href.startsWith('#') || href.startsWith('javascript:')) {
          rawUrl = null
        } else {
          rawUrl = `${baseUrl}/${href}`
        }
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
          rawLocation,
          rawUrl,
          rawSpeakers,
          status: 'new',
        },
      })
      discovered++
    }

    return { discovered, skipped }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes('abort') || message.includes('timeout')) {
      return { discovered, skipped, error: 'Request timed out (25s). Site may be slow or blocking.' }
    }
    if (message.includes('ECONNREFUSED') || message.includes('ENOTFOUND')) {
      return { discovered, skipped, error: 'Could not connect to site' }
    }
    if (message.includes('fetch failed') || message.includes('UNABLE_TO_VERIFY')) {
      return { discovered, skipped, error: 'Connection failed (possible SSL issue or site blocking). Try again later.' }
    }
    return { discovered, skipped, error: message }
  }
}
