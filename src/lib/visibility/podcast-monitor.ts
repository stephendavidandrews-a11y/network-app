import { PrismaClient } from '@prisma/client'
import { execSync } from 'child_process'
import Parser from 'rss-parser'
import { budgetedCreate, truncateForAPI } from '@/lib/api-budget'

const MAX_EPISODES_PER_FEED = 20
const CLAUDE_MODEL = 'claude-sonnet-4-20250514'

// --- Expertise Keywords ---
const PRIMARY_KEYWORDS = [
  'cftc', 'commodity futures', 'derivatives', 'swaps', 'futures regulation',
  'prediction market', 'kalshi', 'polymarket', 'event contract',
  'loper bright', 'chevron deference', 'major questions', 'agency deference',
  'defi regulation', 'defi governance', 'defi policy',
]

const SECONDARY_KEYWORDS = [
  'digital asset', 'crypto regulation', 'crypto oversight', 'token classification',
  'stablecoin', 'clearing', 'market structure', 'enforcement action',
  'administrative law', 'agency independence', 'rulemaking',
  'sec crypto', 'genius act', 'clarity act', 'commodity exchange act',
  'nfa', 'fcm', 'swap dealer',
]

const TERTIARY_KEYWORDS = [
  'financial regulation', 'regulatory framework', 'congressional oversight',
  'executive authority', 'independent agency', 'federal preemption',
]

const ALL_KEYWORDS = [...PRIMARY_KEYWORDS, ...SECONDARY_KEYWORDS, ...TERTIARY_KEYWORDS]

// --- RSS Fetching (reuse pattern from rss-parser.ts) ---
async function fetchFeedContent(url: string): Promise<{ text: string; error?: string }> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 20000)
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*',
      },
      signal: controller.signal,
    })
    clearTimeout(timeout)
    if (response.ok) {
      const text = await response.text()
      const trimmed = text.trim()
      if (trimmed.startsWith('<?xml') || trimmed.startsWith('<rss') || trimmed.startsWith('<feed')) {
        return { text }
      }
    }
  } catch { /* fall through to curl */ }

  try {
    const result = execSync(
      `curl -s -L -H "User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" --max-time 30 "${url}"`,
      { encoding: 'utf-8', timeout: 35000, maxBuffer: 10 * 1024 * 1024 }
    )
    const trimmed = result.trim()
    if (trimmed.startsWith('<?xml') || trimmed.startsWith('<rss') || trimmed.startsWith('<feed')) {
      return { text: result }
    }
    return { text: '', error: 'Neither fetch nor curl returned valid RSS/XML' }
  } catch (e) {
    return { text: '', error: `Curl failed: ${e instanceof Error ? e.message : String(e)}` }
  }
}

// --- Triage ---
function triageEpisode(title: string, description: string | null, podcastTier: number): 'passed' | 'filtered' {
  if (podcastTier === 1) return 'passed'
  const text = `${title} ${description || ''}`.toLowerCase()
  const primaryHits = PRIMARY_KEYWORDS.filter(kw => text.includes(kw))
  const allHits = ALL_KEYWORDS.filter(kw => text.includes(kw))
  if (podcastTier === 2 && allHits.length >= 1) return 'passed'
  if (podcastTier === 3 && (primaryHits.length >= 1 || allHits.length >= 2)) return 'passed'
  return 'filtered'
}

// --- Contact Context (same pattern as content-extractor.ts) ---
async function buildContactContext(prisma: PrismaClient): Promise<string> {
  const contacts = await prisma.contact.findMany({
    where: { tier: { in: [1, 2] } },
    select: { name: true, organization: true, title: true },
    orderBy: { name: 'asc' },
  })

  let dismissedNames: string[] = []
  try {
    const dismissed = await (prisma as any).dismissedIntelPerson.findMany({ select: { name: true } })
    dismissedNames = dismissed.map((d: any) => d.name)
  } catch { /* table may not exist */ }

  try {
    const dismissedExtractions = await prisma.contentExtraction.findMany({
      where: { extractionType: 'person_mention', networkStatus: 'dismissed' },
      select: { discoveredName: true },
      distinct: ['discoveredName'],
    })
    for (const e of dismissedExtractions) {
      if (e.discoveredName && !dismissedNames.includes(e.discoveredName)) {
        dismissedNames.push(e.discoveredName)
      }
    }
  } catch { /* fields may not exist */ }

  let context = '\n## Known Contacts (Tier 1-2)\n'
  for (const c of contacts) {
    context += `- ${c.name}${c.title ? `, ${c.title}` : ''}${c.organization ? ` at ${c.organization}` : ''}\n`
  }
  if (dismissedNames.length > 0) {
    context += '\n## Dismissed Persons (do not extract)\n'
    context += dismissedNames.join(', ') + '\n'
  }
  return context
}

function fuzzyMatch(a: string, b: string): boolean {
  const normalize = (s: string) => s.toLowerCase().trim()
  const partsA = normalize(a).split(/\s+/)
  const partsB = normalize(b).split(/\s+/)
  if (partsA.length === 0 || partsB.length === 0) return false
  return partsA[0] === partsB[0] && partsA[partsA.length - 1] === partsB[partsB.length - 1]
}

// --- Core monitor logic for one podcast ---
async function monitorOnePodcast(
  prisma: PrismaClient,
  podcast: any,
  contactContext: string,
  allContacts: Array<{ id: string; name: string }>,
  client: Anthropic,
  stats: { newEpisodes: number; passedTriage: number; filteredTriage: number; guestsDiscovered: number; knownContactAppearances: number; pitchWindows: number; errors: number }
) {
  if (!podcast.rssFeedUrl) return

  // 1. Fetch RSS feed
  const { text: xml, error: fetchError } = await fetchFeedContent(podcast.rssFeedUrl)
  if (fetchError || !xml) {
    console.error(`[PodcastMonitor] ${podcast.name}: ${fetchError || 'Empty feed'}`)
    stats.errors++
    return
  }

  // 2. Parse RSS
  const parser = new Parser({
    customFields: { item: [['itunes:duration', 'duration'], ['itunes:author', 'author']] },
  })
  let feed: any
  try {
    // Sanitize XML (fix unescaped ampersands)
    const sanitized = xml.replace(/&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[0-9a-fA-F]+;)/g, '&amp;')
    feed = await parser.parseString(sanitized)
  } catch (e) {
    console.error(`[PodcastMonitor] ${podcast.name}: RSS parse error — ${e instanceof Error ? e.message : String(e)}`)
    stats.errors++
    return
  }

  const items = (feed.items || []).slice(0, MAX_EPISODES_PER_FEED)
  if (items.length === 0) return

  // 3. Dedup — get existing episodes for this podcast
  const existing = await prisma.podcastEpisode.findMany({
    where: { podcastId: podcast.id },
    select: { episodeUrl: true, title: true, publishedAt: true },
  })
  const existingUrls = new Set(existing.filter(e => e.episodeUrl).map(e => e.episodeUrl))
  const existingKeys = new Set(existing.map(e => `${e.title}|${e.publishedAt}`))

  const newEpisodes: any[] = []
  for (const item of items) {
    const episodeUrl = item.link || item.enclosure?.url || null
    const title = item.title || 'Untitled'
    const publishedAt = item.pubDate ? new Date(item.pubDate).toISOString() : null

    // Dedup check
    if (episodeUrl && existingUrls.has(episodeUrl)) continue
    if (existingKeys.has(`${title}|${publishedAt}`)) continue

    // Parse duration
    let durationMinutes: number | null = null
    if (item.duration) {
      const dur = String(item.duration)
      const parts = dur.split(':').map(Number)
      if (parts.length === 3) durationMinutes = Math.round(parts[0] * 60 + parts[1] + parts[2] / 60)
      else if (parts.length === 2) durationMinutes = Math.round(parts[0] + parts[1] / 60)
      else if (!isNaN(Number(dur))) durationMinutes = Math.round(Number(dur) / 60)
    }

    // Create episode
    const episode = await prisma.podcastEpisode.create({
      data: {
        podcastId: podcast.id,
        title,
        description: item.contentSnippet || item.content || null,
        episodeUrl,
        audioUrl: item.enclosure?.url || null,
        publishedAt,
        durationMinutes,
        triageStatus: 'new',
        ingestionStatus: 'pending',
      },
    })
    newEpisodes.push({ ...episode, description: item.contentSnippet || item.content || null })
    stats.newEpisodes++
  }

  // Update lastEpisodeMonitoredAt
  await prisma.podcast.update({
    where: { id: podcast.id },
    data: { lastEpisodeMonitoredAt: new Date().toISOString() },
  })

  if (newEpisodes.length === 0) return
  console.log(`[PodcastMonitor] ${podcast.name}: ${newEpisodes.length} new episodes`)

  // 4. Triage
  const passedEpisodes: any[] = []
  for (const ep of newEpisodes) {
    const result = triageEpisode(ep.title, ep.description, podcast.tier)
    await prisma.podcastEpisode.update({
      where: { id: ep.id },
      data: { triageStatus: result },
    })
    if (result === 'passed') {
      passedEpisodes.push(ep)
      stats.passedTriage++
    } else {
      stats.filteredTriage++
    }
  }

  if (passedEpisodes.length === 0) return
  console.log(`[PodcastMonitor] ${podcast.name}: ${passedEpisodes.length} passed triage, extracting...`)

  // 5. Claude extraction for passed episodes
  for (const episode of passedEpisodes) {
    try {
      const prompt = `You are extracting structured data from a podcast episode listing for a CFTC regulatory strategist.

Podcast: ${podcast.name} (Tier ${podcast.tier})
Host: ${podcast.host || 'Unknown'}

Episode Title: ${episode.title}
Published: ${episode.publishedAt || 'Unknown'}
Description: ${episode.description || 'No description available'}

${contactContext}

Extract the following as JSON:

{
  "guests": [
    {
      "name": "Full name of guest",
      "title": "Current professional title or null",
      "organization": "Current organization or null",
      "context": "What they discussed or why they appeared",
      "confidence": "high | medium"
    }
  ],
  "knownContactAppearances": [
    {
      "name": "Name as it appears",
      "context": "What they discussed on this episode"
    }
  ],
  "topicRelevanceScore": 0,
  "topicTags": [],
  "isPitchWindow": false,
  "pitchAngle": null
}

## Scoring Guide
9-10: Episode directly covers CFTC, derivatives regulation, digital asset jurisdiction, prediction markets
7-8: Covers adjacent regulation with clear CFTC implications (SEC crypto, congressional market structure legislation, admin law)
5-6: Financial regulation or crypto policy with indirect relevance
3-4: Tangentially related (general fintech, broad crypto market discussion)
0-2: No regulatory/policy connection

## Guest Extraction Rules
- ONLY extract guests you can identify with reasonable confidence — full name plus at least title or organization
- Do NOT guess or extract partial names ("someone from the SEC")
- If the description doesn't clearly identify guests, return empty guests array
- Do NOT extract people listed in "Known Contacts" — include them in knownContactAppearances instead

## Pitch Window
Set isPitchWindow: true if topicRelevanceScore >= 6.

Only return the JSON object.`

      const response = await budgetedCreate({
        model: CLAUDE_MODEL,
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }],
      }, 'podcast-monitor')

      const text = response.content[0]?.type === 'text' ? response.content[0].text : ''
      const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()

      let result: any
      try {
        result = JSON.parse(cleaned)
      } catch {
        console.error(`[PodcastMonitor] Failed to parse extraction for "${episode.title}"`)
        continue
      }

      const guestNames = (result.guests || []).map((g: any) => g.name).filter(Boolean)
      const isPitchWindow = result.isPitchWindow === true && (result.topicRelevanceScore || 0) >= 6

      // Update episode record
      await prisma.podcastEpisode.update({
        where: { id: episode.id },
        data: {
          guestNames: JSON.stringify(guestNames),
          guestExtractions: JSON.stringify(result),
          topicTags: JSON.stringify(result.topicTags || []),
          topicRelevanceScore: result.topicRelevanceScore || 0,
          isPitchWindow,
          pitchWindowExpiresAt: isPitchWindow && episode.publishedAt
            ? new Date(new Date(episode.publishedAt).getTime() + 14 * 24 * 60 * 60 * 1000).toISOString()
            : null,
          ingestionStatus: 'extracted',
        },
      })

      if (isPitchWindow) stats.pitchWindows++

      // Create ContentItem stub for this episode (so ContentExtractions can link to it)
      let contentItem: any = null
      if (guestNames.length > 0 || (result.knownContactAppearances || []).length > 0) {
        contentItem = await prisma.contentItem.create({
          data: {
            sourceType: 'podcast_episode',
            title: episode.title,
            publication: podcast.name,
            sourceUrl: episode.episodeUrl || null,
            publishedAt: episode.publishedAt || null,
            summary: (episode.description || '').slice(0, 500),
            ingestionStatus: 'extracted',
            topicRelevanceScore: result.topicRelevanceScore || 0,
            topicTags: JSON.stringify(result.topicTags || []),
          },
        })

        // Link episode to content item
        await prisma.podcastEpisode.update({
          where: { id: episode.id },
          data: { contentItemId: contentItem.id },
        })
      }

      // Process NEW guests
      for (const guest of (result.guests || [])) {
        if (!guest.name) continue

        // Check if known contact
        const matchedContact = allContacts.find(c => fuzzyMatch(c.name, guest.name))
        if (matchedContact) {
          // Create intelligence signal
          await prisma.intelligenceSignal.create({
            data: {
              contactId: matchedContact.id,
              signalType: 'podcast_appearance',
              title: `Appeared on ${podcast.name}: ${episode.title}`,
              description: guest.context || `Guest on ${podcast.name}`,
              sourceUrl: episode.episodeUrl || null,
              sourceName: podcast.name,
              outreachHook: `Heard your appearance on ${podcast.name} discussing ${(result.topicTags || []).slice(0, 2).join(' and ') || 'the topic'}`,
              relevanceScore: result.topicRelevanceScore || 0,
            },
          })
          stats.knownContactAppearances++
        } else if (contentItem) {
          // New person — create ContentExtraction for People Discovered queue
          await prisma.contentExtraction.create({
            data: {
              contentItemId: contentItem.id,
              extractionType: 'person_mention',
              summary: guest.context || `Guest on ${podcast.name}`,
              discoveredName: guest.name,
              discoveredTitle: guest.title || null,
              discoveredOrg: guest.organization || null,
              discoveredContext: guest.context || null,
              topic: (result.topicTags || [])[0] || null,
              confidence: guest.confidence || 'medium',
              networkStatus: 'new_potential',
              discoverySource: 'podcast',
              podcastEpisodeId: episode.id,
            },
          })
          stats.guestsDiscovered++
        }
      }

      // Process known contact appearances
      for (const appearance of (result.knownContactAppearances || [])) {
        if (!appearance.name) continue
        const matchedContact = allContacts.find(c => fuzzyMatch(c.name, appearance.name))
        if (matchedContact) {
          // Check if signal already created above (avoid dups)
          const existing = await prisma.intelligenceSignal.findFirst({
            where: {
              contactId: matchedContact.id,
              signalType: 'podcast_appearance',
              sourceUrl: episode.episodeUrl || undefined,
            },
          })
          if (!existing) {
            await prisma.intelligenceSignal.create({
              data: {
                contactId: matchedContact.id,
                signalType: 'podcast_appearance',
                title: `Appeared on ${podcast.name}: ${episode.title}`,
                description: appearance.context || `Guest on ${podcast.name}`,
                sourceUrl: episode.episodeUrl || null,
                sourceName: podcast.name,
                outreachHook: `Heard your appearance on ${podcast.name} discussing ${(result.topicTags || []).slice(0, 2).join(' and ') || 'the topic'}`,
                relevanceScore: result.topicRelevanceScore || 0,
              },
            })
            stats.knownContactAppearances++
          }
        }
      }

      console.log(`[PodcastMonitor]   "${episode.title}" — score: ${result.topicRelevanceScore}, guests: ${guestNames.length}, pitch: ${isPitchWindow}`)

    } catch (error) {
      console.error(`[PodcastMonitor] Extraction error for "${episode.title}":`, error instanceof Error ? error.message : String(error))
      stats.errors++
    }
  }
}

// --- Main exports ---
export async function runPodcastMonitor(prisma: PrismaClient) {
  console.log('[PodcastMonitor] Starting podcast monitor...')
  const stats = {
    podcastsChecked: 0, newEpisodes: 0, passedTriage: 0, filteredTriage: 0,
    guestsDiscovered: 0, knownContactAppearances: 0, pitchWindows: 0, errors: 0,
  }

  const podcasts = await prisma.podcast.findMany({
    where: { status: { not: 'dormant' }, rssFeedUrl: { not: null } },
    include: {
      hostContact: { select: { name: true } },
    },
  })

  if (podcasts.length === 0) {
    console.log('[PodcastMonitor] No active podcasts with RSS URLs')
    return stats
  }

  const contactContext = await buildContactContext(prisma)
  const allContacts = await prisma.contact.findMany({ select: { id: true, name: true } })
  const podcastMap = new Map(podcasts.map(p => [p.id, p]))

  for (const podcast of podcasts) {
    stats.podcastsChecked++
    try {
      await monitorOnePodcast(prisma, podcast, contactContext, allContacts, client, stats)
    } catch (error) {
      console.error(`[PodcastMonitor] Error monitoring ${podcast.name}:`, error instanceof Error ? error.message : String(error))
      stats.errors++
    }
  }

  console.log(`[PodcastMonitor] Done: ${stats.podcastsChecked} podcasts, ${stats.newEpisodes} new episodes, ${stats.passedTriage} passed triage, ${stats.pitchWindows} pitch windows, ${stats.guestsDiscovered} guests discovered, ${stats.knownContactAppearances} known appearances`)
  return stats
}

export async function runSinglePodcastMonitor(prisma: PrismaClient, podcastId: string) {
  const podcast = await prisma.podcast.findUnique({
    where: { id: podcastId },
    include: { hostContact: { select: { name: true } } },
  })
  if (!podcast) return { error: 'Podcast not found' }
  if (!podcast.rssFeedUrl) return { error: 'No RSS feed URL configured' }

  const stats = {
    podcastsChecked: 1, newEpisodes: 0, passedTriage: 0, filteredTriage: 0,
    guestsDiscovered: 0, knownContactAppearances: 0, pitchWindows: 0, errors: 0,
  }

  const contactContext = await buildContactContext(prisma)
  const allContacts = await prisma.contact.findMany({ select: { id: true, name: true } })
  await monitorOnePodcast(prisma, podcast, contactContext, allContacts, client, stats)
  return stats
}
