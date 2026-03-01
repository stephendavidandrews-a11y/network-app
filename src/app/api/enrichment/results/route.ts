import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const results = await prisma.enrichmentResult.findMany({
      include: {
        contact: {
          select: {
            id: true,
            name: true,
            organization: true,
            email: true,
            tier: true,
            strategicValue: true,
          },
        },
      },
      orderBy: [{ status: 'asc' }, { score: 'desc' }],
    })

    return NextResponse.json(results)
  } catch (error) {
    console.error('[Enrichment] Results list error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
