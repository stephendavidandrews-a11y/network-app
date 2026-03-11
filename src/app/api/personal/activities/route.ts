import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const contactId = request.nextUrl.searchParams.get('contactId')
    if (!contactId) {
      return NextResponse.json({ error: 'contactId required' }, { status: 400 })
    }

    const activities = await prisma.personalActivity.findMany({
      where: { contactId },
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json(activities)
  } catch (error) {
    console.error('[Activities] GET error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    if (!body.contactId || !body.activity) {
      return NextResponse.json({ error: 'contactId and activity required' }, { status: 400 })
    }

    const activity = await prisma.personalActivity.create({
      data: {
        contactId: body.contactId,
        activity: body.activity.trim(),
        frequency: body.frequency || 'occasional',
        confidence: body.confidence || 'medium',
        source: body.source || 'manual',
      },
    })
    return NextResponse.json(activity, { status: 201 })
  } catch (error) {
    console.error('[Activities] POST error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get('id')
    if (!id) {
      return NextResponse.json({ error: 'id required' }, { status: 400 })
    }

    await prisma.personalActivity.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Activities] DELETE error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
