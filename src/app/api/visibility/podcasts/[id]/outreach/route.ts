import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const outreach = await prisma.podcastOutreach.findMany({
      where: { podcastId: id },
      orderBy: { createdAt: 'desc' },
      include: { contact: { select: { id: true, name: true } } },
    })
    return NextResponse.json(outreach)
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const body = await request.json()
    const outreach = await prisma.podcastOutreach.create({
      data: {
        podcastId: id,
        contactId: body.contactId || null,
        outreachType: body.outreachType || 'cold_pitch',
        subject: body.subject || null,
        body: body.body || null,
        outcome: body.outcome || 'pending',
        notes: body.notes || null,
      },
    })
    return NextResponse.json(outreach, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
