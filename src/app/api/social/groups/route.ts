import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET() {
  try {
    const groups = await prisma.personalGroup.findMany({
      include: {
        members: {
          include: {
            contact: { select: { id: true, name: true, photoUrl: true, personalRing: true } },
          },
        },
      },
      orderBy: { name: 'asc' },
    })

    const result = groups.map(g => ({
      ...g,
      memberCount: g.members.length,
    }))

    return NextResponse.json(result)
  } catch (error) {
    console.error('[Groups] GET error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    if (!body.name) {
      return NextResponse.json({ error: 'name required' }, { status: 400 })
    }

    const group = await prisma.personalGroup.create({
      data: {
        name: body.name.trim(),
        description: body.description || null,
      },
    })
    return NextResponse.json(group, { status: 201 })
  } catch (error) {
    console.error('[Groups] POST error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
