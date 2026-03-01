import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = await request.json()
  const days = body.days || 1

  const commitment = await prisma.commitment.findUnique({
    where: { id: params.id },
  })

  if (!commitment) {
    return NextResponse.json({ error: 'Commitment not found' }, { status: 404 })
  }

  // Calculate snooze-until date
  const snoozeUntil = new Date()
  snoozeUntil.setDate(snoozeUntil.getDate() + days)
  const snoozeDate = snoozeUntil.toISOString().split('T')[0]

  await prisma.commitment.update({
    where: { id: params.id },
    data: { reminderSnoozedUntil: snoozeDate },
  })

  return NextResponse.json({ success: true, snoozedUntil: snoozeDate })
}
