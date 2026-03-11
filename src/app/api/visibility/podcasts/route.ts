import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const tier = searchParams.get('tier')
    const status = searchParams.get('status')
    const search = searchParams.get('search')

    const where: Record<string, unknown> = {}
    if (tier) where.tier = parseInt(tier)
    if (status) where.status = status
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { host: { contains: search } },
      ]
    }

    const podcasts = await prisma.podcast.findMany({
      where,
      orderBy: [{ tier: 'asc' }, { name: 'asc' }],
      include: {
        _count: { select: { episodes: true, outreach: true } },
        episodes: {
          orderBy: { publishedAt: 'desc' },
          take: 1,
          select: { publishedAt: true, isPitchWindow: true, pitchWindowExpiresAt: true },
        },
        hostContact: { select: { id: true, name: true } },
        producerContact: { select: { id: true, name: true } },
      },
    })

    // Count active pitch windows per podcast
    const now = new Date().toISOString()
    const pitchWindowCounts = await prisma.podcastEpisode.groupBy({
      by: ['podcastId'],
      where: { isPitchWindow: true, pitchWindowExpiresAt: { gt: now } },
      _count: { id: true },
    })
    const pitchMap = new Map(pitchWindowCounts.map(p => [p.podcastId, p._count.id]))

    const enriched = podcasts.map(p => ({
      id: p.id,
      name: p.name,
      host: p.host,
      hostContactId: p.hostContactId,
      hostContact: p.hostContact,
      producerName: p.producerName,
      producerContactId: p.producerContactId,
      producerContact: p.producerContact,
      producerEmail: p.producerEmail,
      pitchEmail: p.pitchEmail,
      rssFeedUrl: p.rssFeedUrl,
      websiteUrl: p.websiteUrl,
      audienceDescription: p.audienceDescription,
      audienceSize: p.audienceSize,
      topicAlignment: p.topicAlignment,
      tier: p.tier,
      status: p.status,
      lastEpisodeMonitoredAt: p.lastEpisodeMonitoredAt,
      notes: p.notes,
      createdAt: p.createdAt,
      episodeCount: p._count.episodes,
      outreachCount: p._count.outreach,
      latestEpisodeDate: p.episodes[0]?.publishedAt || null,
      activePitchWindows: pitchMap.get(p.id) || 0,
    }))

    return NextResponse.json(enriched)
  } catch (error) {
    console.error('[API] GET /visibility/podcasts error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    if (!body.name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 })
    }

    const podcast = await prisma.podcast.create({
      data: {
        name: body.name,
        host: body.host || null,
        hostContactId: body.hostContactId || null,
        producerName: body.producerName || null,
        producerContactId: body.producerContactId || null,
        producerEmail: body.producerEmail || null,
        pitchEmail: body.pitchEmail || null,
        rssFeedUrl: body.rssFeedUrl || null,
        websiteUrl: body.websiteUrl || null,
        audienceDescription: body.audienceDescription || null,
        audienceSize: body.audienceSize || null,
        topicAlignment: body.topicAlignment || 0,
        tier: body.tier || 2,
        status: body.status || 'monitoring',
        notes: body.notes || null,
      },
    })

    return NextResponse.json(podcast, { status: 201 })
  } catch (error) {
    console.error('[API] POST /visibility/podcasts error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
