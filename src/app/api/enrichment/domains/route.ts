import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

// GET: list all domain mappings
export async function GET() {
  try {
    const domains = await prisma.organizationDomain.findMany({
      orderBy: { organization: 'asc' },
    })
    return NextResponse.json(domains)
  } catch (error) {
    console.error('[Enrichment] Domains list error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

// PUT: manually update a domain mapping
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, domain, notes } = body

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    const updated = await prisma.organizationDomain.update({
      where: { id },
      data: {
        domain: domain || null,
        resolvedBy: 'manual',
        notes: notes !== undefined ? notes : undefined,
      },
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error('[Enrichment] Domain update error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
