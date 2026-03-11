import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// GET sync metadata + stats
export async function GET() {
  try {
    const metadata = await prisma.textSyncMetadata.findFirst()

    const messageCount = await prisma.textMessage.count()
    const contactsWithStats = await prisma.textContactCommStats.count()
    const droppedBalls = await prisma.textContactCommStats.count({
      where: { droppedBall: true },
    })
    const groupChats = await prisma.textGroupChat.count()

    return NextResponse.json({
      metadata,
      stats: {
        totalMessages: messageCount,
        contactsWithStats,
        droppedBalls,
        groupChats,
      },
    })
  } catch (error) {
    console.error('[Text Sync] GET error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
