import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const group = await prisma.personalGroup.findUnique({
      where: { id: params.id },
      include: {
        members: {
          include: {
            contact: { select: { id: true, name: true, photoUrl: true, personalRing: true, city: true, phone: true } },
          },
        },
      },
    })

    if (!group) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 })
    }
    return NextResponse.json(group)
  } catch (error) {
    console.error('[Group] GET error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json()
    const group = await prisma.personalGroup.update({
      where: { id: params.id },
      data: {
        ...(body.name && { name: body.name.trim() }),
        ...(body.description !== undefined && { description: body.description }),
      },
    })
    return NextResponse.json(group)
  } catch (error) {
    console.error('[Group] PUT error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await prisma.personalGroup.delete({ where: { id: params.id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Group] DELETE error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
