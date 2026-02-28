import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = await request.json()

  const data: Record<string, unknown> = {}
  if (body.status) data.status = body.status
  if (body.draftSubject !== undefined) data.draftSubject = body.draftSubject
  if (body.draftBody !== undefined) data.draftBody = body.draftBody
  if (body.status === 'approved') data.reviewedAt = new Date().toISOString()
  if (body.status === 'sent') data.sentAt = new Date().toISOString()
  if (body.status === 'deferred' && body.deferredUntil) data.deferredUntil = body.deferredUntil
  if (body.finalText !== undefined) {
    data.finalText = body.finalText
    data.wasEdited = true
  }

  const item = await prisma.outreachQueue.update({
    where: { id: params.id },
    data,
  })

  return NextResponse.json(item)
}
