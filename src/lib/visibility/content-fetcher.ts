import { execSync } from 'child_process'
import { PrismaClient } from '@prisma/client'
import * as cheerio from 'cheerio'

const ARTICLE_SELECTORS = [
  'article .entry-content',
  'article .post-content',
  'article .article-body',
  '.entry-content',
  '.post-content',
  '.article-body',
  '.article-content',
  'article',
  '[role="main"] .content',
  'main .content',
  'main',
]

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml',
  'Accept-Language': 'en-US,en;q=0.9',
}

function extractArticleText(html: string, parserConfig?: Record<string, unknown>): string {
  const $ = cheerio.load(html)

  // Remove nav, header, footer, sidebar, script, style
  $('nav, header, footer, aside, script, style, .sidebar, .nav, .footer, .header, .comments, .related, .share, .social').remove()

  // Try source-specific selector first
  if (parserConfig?.articleSelector) {
    const selectors = String(parserConfig.articleSelector).split(',').map(s => s.trim())
    for (const sel of selectors) {
      const el = $(sel)
      if (el.length > 0) {
        const text = el.text().replace(/\s+/g, ' ').trim()
        if (text.length > 100) return text
      }
    }
  }

  // Try common article selectors
  for (const selector of ARTICLE_SELECTORS) {
    const el = $(selector)
    if (el.length > 0) {
      const text = el.text().replace(/\s+/g, ' ').trim()
      if (text.length > 100) return text
    }
  }

  // Fallback: concatenate all <p> tags
  const paragraphs: string[] = []
  $('p').each((_, el) => {
    const text = $(el).text().trim()
    if (text.length > 20) paragraphs.push(text)
  })
  return paragraphs.join('\n\n')
}


// Curl fallback for Cloudflare-protected sites
function fetchWithCurl(url: string): string | null {
  try {
    const result = execSync(
      `curl -s -L --max-time 30 -H "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" -H "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" -H "Accept-Language: en-US,en;q=0.9" "${url}"`,
      { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024, timeout: 35000 }
    )
    if (result && result.length > 200) return result
    return null
  } catch { return null }
}

export async function fetchIntelContent(
  prisma: PrismaClient
): Promise<{ fetched: number; skipped: number; errors: number }> {
  let fetched = 0
  let skipped = 0
  let errors = 0

  const discoveries = await prisma.discoveredEvent.findMany({
    where: { status: 'triaged' },
    include: { source: { select: { name: true, category: true, parserConfig: true } } },
    orderBy: { scrapedAt: 'desc' },
    take: 100,
  })

  if (discoveries.length === 0) return { fetched, skipped, errors }

  console.log(`[ContentFetcher] Fetching full text for ${discoveries.length} triaged articles...`)

  for (const d of discoveries) {
    if (!d.rawUrl) {
      await prisma.discoveredEvent.update({
        where: { id: d.id },
        data: { status: 'ingested', dismissedReason: 'No URL to fetch' },
      })
      skipped++
      continue
    }

    // Dedup: check if ContentItem already exists for this URL
    const existing = await prisma.contentItem.findFirst({
      where: { sourceUrl: d.rawUrl },
    })
    if (existing) {
      await prisma.discoveredEvent.update({
        where: { id: d.id },
        data: { status: 'ingested' },
      })
      skipped++
      continue
    }

    try {
      let html = ''
      let usedCurl = false
      let parserConfig: Record<string, unknown> = {}
      try { parserConfig = JSON.parse(d.source.parserConfig || '{}') } catch {}

      // Try native fetch first
      try {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 15000)
        const response = await fetch(d.rawUrl, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          },
          redirect: 'follow',
        })
        clearTimeout(timeout)

        if (response.ok) {
          html = await response.text()
        } else {
          console.log(`[content-fetcher] HTTP ${response.status} for ${d.rawUrl}, trying curl...`)
        }
      } catch (fetchErr: any) {
        console.log(`[content-fetcher] Fetch failed for ${d.rawUrl}: ${fetchErr.message}, trying curl...`)
      }

      // Extract text
      let fullText = html ? extractArticleText(html, parserConfig) : ''

      // If fetch failed or content is thin, try curl fallback
      if (fullText.length < 100) {
        const curlHtml = fetchWithCurl(d.rawUrl)
        if (curlHtml) {
          usedCurl = true
          html = curlHtml
          fullText = extractArticleText(curlHtml, parserConfig)
          if (fullText.length >= 100) {
            console.log(`[content-fetcher] Curl fallback succeeded for ${d.rawUrl} (${fullText.length} chars)`)
          }
        }
      }

      if (fullText.length < 100) {
        await prisma.discoveredEvent.update({
          where: { id: d.id },
          data: { status: 'ingested', dismissedReason: 'Empty content (paywall or JS-rendered)' },
        })
        skipped++
        continue
      }

      // Truncate to 50k chars
      if (fullText.length > 50000) fullText = fullText.substring(0, 50000)

      const wordCount = fullText.split(/\s+/).length

      // Determine sourceType from source category
      const sourceTypeMap: Record<string, string> = {
        government: 'government',
        law_firm: 'law_firm',
        academic: 'academic',
        legal: 'legal',
        think_tank: 'think_tank',
        industry_conference: 'industry',
        news: 'news',
        podcast: 'podcast',
        dc_local: 'local',
      }

      // Strip "(Intel)" from source name for cleaner publication name
      const publication = d.source.name.replace(' (Intel)', '')

      await prisma.contentItem.create({
        data: {
          sourceType: sourceTypeMap[d.source.category] || 'other',
          title: d.rawTitle,
          publication,
          publishedAt: d.rawDate || null,
          sourceUrl: d.rawUrl,
          fullText,
          wordCount,
          ingestionStatus: 'fetched',
          topicRelevanceScore: d.topicRelevanceScore || 0,
        },
      })

      await prisma.discoveredEvent.update({
        where: { id: d.id },
        data: { status: 'ingested' },
      })

      fetched++
    } catch (error) {
      const msg = String(error).substring(0, 100)
      console.log(`[ContentFetcher] Error fetching ${d.rawTitle.substring(0, 40)}: ${msg}`)
      await prisma.discoveredEvent.update({
        where: { id: d.id },
        data: { status: 'ingested', dismissedReason: `Fetch error: ${msg}` },
      })
      errors++
    }
  }

  console.log(`[ContentFetcher] Complete: ${fetched} fetched, ${skipped} skipped, ${errors} errors`)
  return { fetched, skipped, errors }
}
