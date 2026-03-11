import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const podcast = await prisma.podcast.findUnique({
      where: { id },
      include: {
        episodes: {
          orderBy: { publishedAt: 'desc' },
          take: 20,
        },
        outreach: {
          orderBy: { createdAt: 'desc' },
          include: { contact: { select: { id: true, name: true } } },
        },
        hostContact: { select: { id: true, name: true, organization: true } },
        producerContact: { select: { id: true, name: true, organization: true } },
      },
    })
    if (!podcast) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const enriched = {
      ...podcast,
      episodes: podcast.episodes.map(e => ({
        ...e,
        guestNames: e.guestNames ? JSON.parse(e.guestNames) : [],
        topicTags: e.topicTags ? JSON.parse(e.topicTags) : [],
      })),
    }
    return NextResponse.json(enriched)
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const body = await request.json()
    const data: Record<string, unknown> = {}

    const fields = ['name', 'host', 'hostContactId', 'producerName', 'producerContactId',
      'producerEmail', 'pitchEmail', 'rssFeedUrl', 'websiteUrl', 'audienceDescription',
      'audienceSize', 'topicAlignment', 'tier', 'status', 'notes']
    for (const f of fields) {
      if (body[f] !== undefined) data[f] = body[f]
    }

    const podcast = await prisma.podcast.update({ where: { id }, data })
    return NextResponse.json(podcast)
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    await prisma.podcast.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
