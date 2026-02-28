import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET() {
  const items = await prisma.outreachQueue.findMany({
    orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
    include: { contact: true },
  })
  return NextResponse.json(items)
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const item = await prisma.outreachQueue.create({
    data: {
      contactId: body.contactId,
      triggerType: body.triggerType,
      triggerDescription: body.triggerDescription,
      signalId: body.signalId || null,
      eventId: body.eventId || null,
      priority: body.priority || 3,
      draftSubject: body.draftSubject || null,
      draftBody: body.draftBody || null,
      draftFormat: body.draftFormat || 'email',
      status: body.status || 'queued',
    },
  })
  return NextResponse.json(item, { status: 201 })
}
