import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json()
    if (!body.contactId) {
      return NextResponse.json({ error: 'contactId required' }, { status: 400 })
    }

    const member = await prisma.personalGroupMember.create({
      data: {
        groupId: params.id,
        contactId: body.contactId,
      },
    })
    return NextResponse.json(member, { status: 201 })
  } catch (error) {
    console.error('[Group Members] POST error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const contactId = request.nextUrl.searchParams.get('contactId')
    if (!contactId) {
      return NextResponse.json({ error: 'contactId required' }, { status: 400 })
    }

    await prisma.personalGroupMember.deleteMany({
      where: { groupId: params.id, contactId },
    })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Group Members] DELETE error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
