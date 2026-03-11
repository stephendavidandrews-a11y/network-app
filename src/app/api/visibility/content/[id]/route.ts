import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// GET /api/visibility/content/[id] - Single content item with extractions
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const item = await prisma.contentItem.findUnique({
      where: { id: params.id },
      include: {
        extractions: {
          orderBy: { createdAt: 'desc' },
        },
      },
    })

    if (!item) {
      return NextResponse.json({ error: 'Content item not found' }, { status: 404 })
    }

    return NextResponse.json({
      ...item,
      topicTags: item.topicTags ? JSON.parse(item.topicTags) : [],
    })
  } catch (error) {
    console.error('[API] GET /visibility/content/[id] error:', error)
    return NextResponse.json({ error: 'Failed to fetch content item' }, { status: 500 })
  }
}

// PATCH /api/visibility/content/[id] - Update notes/tags
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json()
    const { notes, topicTags } = body

    const data: Record<string, unknown> = {}
    if (notes !== undefined) data.notes = notes
    if (topicTags !== undefined) data.topicTags = JSON.stringify(topicTags)

    const updated = await prisma.contentItem.update({
      where: { id: params.id },
      data,
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error('[API] PATCH /visibility/content/[id] error:', error)
    return NextResponse.json({ error: 'Failed to update content item' }, { status: 500 })
  }
}
