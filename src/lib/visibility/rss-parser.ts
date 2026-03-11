import RSSParser from 'rss-parser'
import { PrismaClient } from '@prisma/client'
import { execSync } from 'child_process'

interface RSSParserConfig {
  feedUrl?: string
  titleSelector?: string
  dateSelector?: string
  linkSelector?: string
}

function sanitizeXML(xml: string): string {
  return xml.replace(/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[\da-fA-F]+);)/g, '&amp;')
}

// Fetch with Node fetch first, fall back to curl for Cloudflare-protected sites
async function fetchFeedContent(url: string): Promise<{ text: string; error?: string }> {
  // Try native fetch first
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 20000)
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*',
      },
      signal: controller.signal,
    })
    clearTimeout(timeout)

    if (response.ok) {
      const text = await response.text()
      const trimmed = text.trimStart()
      // Verify we got XML, not a Cloudflare challenge page
      if (trimmed.startsWith('<?xml') || trimmed.startsWith('<rss') || trimmed.startsWith('<feed')) {
        return { text }
      }
    }
  } catch {
    // Fall through to curl
  }

  // Fallback: use curl (bypasses Cloudflare TLS fingerprinting)
  try {
    console.log(`[RSS] Falling back to curl for: ${url}`)
    const curlResult = execSync(
      `curl -s -L -H "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" --max-time 30 "${url}"`,
      { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024, timeout: 35000 }
    )
    const trimmed = curlResult.trimStart()
    if (trimmed.startsWith('<?xml') || trimmed.startsWith('<rss') || trimmed.startsWith('<feed')) {
      return { text: curlResult }
    }
    return { text: '', error: 'Neither fetch nor curl returned valid RSS/XML' }
  } catch (curlError) {
    return { text: '', error: `Curl fallback failed: ${curlError instanceof Error ? curlError.message : String(curlError)}` }
  }
}

export async function scrapeRSSSource(
  prisma: PrismaClient,
  sourceId: string,
  url: string,
  config: RSSParserConfig
): Promise<{ discovered: number; skipped: number; error?: string }> {
  const feedUrl = config.feedUrl || url
  let discovered = 0
  let skipped = 0

  try {
    const { text: rawText, error: fetchError } = await fetchFeedContent(feedUrl)

    if (fetchError || !rawText) {
      return { discovered: 0, skipped: 0, error: fetchError || 'Empty feed response' }
    }

    // Sanitize XML before parsing
    const sanitized = sanitizeXML(rawText)

    const parser = new RSSParser({
      timeout: 15000,
      customFields: {
        item: [
          ['dc:creator', 'creator'],
          ['category', 'categories', { keepArray: true }],
        ],
      },
    })

    const feed = await parser.parseString(sanitized)

    for (const item of feed.items || []) {
      const rawTitle = item.title?.trim()
      if (!rawTitle) continue

      const rawUrl = item.link || item.guid || null
      const rawDate = item.pubDate || item.isoDate || null
      const rawDescription = item.contentSnippet || item.content || item.summary || null

      // Dedup: check by URL first, then by title+date
      if (rawUrl) {
        const existing = await prisma.discoveredEvent.findFirst({
          where: { sourceId, rawUrl },
        })
        if (existing) { skipped++; continue }
      }

      const titleWhere: Record<string, unknown> = { sourceId, rawTitle }
      if (rawDate) titleWhere.rawDate = rawDate
      const existingByTitle = await prisma.discoveredEvent.findFirst({
        where: titleWhere,
      })
      if (existingByTitle) { skipped++; continue }

      await prisma.discoveredEvent.create({
        data: {
          sourceId,
          rawTitle,
          rawDescription: rawDescription?.substring(0, 2000) || null,
          rawDate,
          rawUrl,
          rawLocation: null,
          rawSpeakers: null,
          status: 'new',
        },
      })
      discovered++
    }

    return { discovered, skipped }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes('Invalid character in entity name')) {
      return { discovered, skipped, error: 'Malformed XML in feed (unescaped special characters).' }
    }
    if (message.includes('ECONNREFUSED') || message.includes('ENOTFOUND')) {
      return { discovered, skipped, error: 'Could not connect to feed URL' }
    }
    if (message.includes('abort')) {
      return { discovered, skipped, error: 'Feed request timed out (20s)' }
    }
    return { discovered, skipped, error: message }
  }
}
