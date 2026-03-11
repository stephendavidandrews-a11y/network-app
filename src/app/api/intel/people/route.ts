import { NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status') || 'new_potential'
    const limit = Math.min(parseInt(searchParams.get('limit') || '30'), 100)

    // Get all person_mention extractions with the target networkStatus
    const extractions = await prisma.contentExtraction.findMany({
      where: {
        extractionType: 'person_mention',
        networkStatus: status,
        discoveredName: { not: null },
      },
      include: {
        contentItem: {
          select: {
            title: true,
            publication: true,
            sourceUrl: true,
            topicRelevanceScore: true,
            publishedAt: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    // Group by normalized name
    const peopleMap = new Map<string, any>()

    for (const ext of extractions) {
      const nameKey = (ext.discoveredName || '').toLowerCase().trim()
      if (!nameKey) continue

      if (!peopleMap.has(nameKey)) {
        peopleMap.set(nameKey, {
          name: ext.discoveredName,
          title: ext.discoveredTitle,
          org: ext.discoveredOrg,
          contexts: [],
          articles: [],
          articleCount: 0,
          firstSeen: ext.createdAt,
          mostRecent: ext.createdAt,
          extractionIds: [],
          confidence: ext.confidence || 'medium',
          topArticle: null,
        })
      }

      const person = peopleMap.get(nameKey)!
      person.extractionIds.push(ext.id)

      // Update title/org if better info available
      if (ext.discoveredTitle && !person.title) person.title = ext.discoveredTitle
      if (ext.discoveredOrg && !person.org) person.org = ext.discoveredOrg
      if (ext.discoveredContext && !person.contexts.includes(ext.discoveredContext)) {
        person.contexts.push(ext.discoveredContext)
      }

      // Track articles
      const articleKey = ext.contentItem?.title || ext.contentItemId
      if (!person.articles.includes(articleKey)) {
        person.articles.push(articleKey)
        person.articleCount++
      }

      // Track dates
      if (ext.createdAt < person.firstSeen) person.firstSeen = ext.createdAt
      if (ext.createdAt > person.mostRecent) person.mostRecent = ext.createdAt

      // Track top article by relevance
      if (ext.contentItem && (!person.topArticle || ext.contentItem.topicRelevanceScore > (person.topArticle.score || 0))) {
        person.topArticle = {
          title: ext.contentItem.title,
          publication: ext.contentItem.publication,
          url: ext.contentItem.sourceUrl,
          score: ext.contentItem.topicRelevanceScore,
        }
      }
    }

    // Sort by article count (more mentions = higher priority), then most recent
    const people = Array.from(peopleMap.values())
      .sort((a, b) => b.articleCount - a.articleCount || b.mostRecent.localeCompare(a.mostRecent))
      .slice(0, limit)

    return NextResponse.json({
      people,
      total: peopleMap.size,
    })
  } catch (error) {
    console.error('People API error:', error)
    return NextResponse.json({ error: 'Failed to fetch people' }, { status: 500 })
  }
}
