import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function PATCH(request: NextRequest) {
  const body = await request.json()
  const { ids, updates } = body as {
    ids: string[]
    updates: { tier?: number; status?: string }
  }

  if (!ids?.length || !updates) {
    return NextResponse.json({ error: 'ids and updates required' }, { status: 400 })
  }

  const data: Record<string, unknown> = {}
  if (updates.tier !== undefined) {
    data.tier = updates.tier
    // Update cadence based on tier
    const cadenceMap: Record<number, number> = { 1: 30, 2: 60, 3: 90 }
    data.targetCadenceDays = cadenceMap[updates.tier] || 60
  }
  if (updates.status !== undefined) {
    data.status = updates.status
  }

  const result = await prisma.contact.updateMany({
    where: { id: { in: ids } },
    data,
  })

  return NextResponse.json({ updated: result.count })
}
