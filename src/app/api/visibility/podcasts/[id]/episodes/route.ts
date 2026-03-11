import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const { searchParams } = new URL(request.url)
    const isPitchWindow = searchParams.get('isPitchWindow')
    const triageStatus = searchParams.get('triageStatus')
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    const where: Record<string, unknown> = { podcastId: id }
    if (isPitchWindow === 'true') where.isPitchWindow = true
    if (triageStatus) where.triageStatus = triageStatus

    const [episodes, total] = await Promise.all([
      prisma.podcastEpisode.findMany({
        where,
        orderBy: { publishedAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.podcastEpisode.count({ where }),
    ])

    const enriched = episodes.map(e => ({
      ...e,
      guestNames: e.guestNames ? JSON.parse(e.guestNames) : [],
      topicTags: e.topicTags ? JSON.parse(e.topicTags) : [],
    }))

    return NextResponse.json({ episodes: enriched, total })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
