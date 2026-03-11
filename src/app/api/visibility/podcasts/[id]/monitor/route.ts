import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { runSinglePodcastMonitor } from '@/lib/visibility/podcast-monitor'

export const dynamic = 'force-dynamic'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const result = await runSinglePodcastMonitor(prisma, id)
    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
