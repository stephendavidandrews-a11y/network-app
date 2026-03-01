/**
 * GET /api/contacts/[id]/dossier — Read latest dossier
 * POST /api/contacts/[id]/dossier — Trigger re-synthesis
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { synthesizeDossier } from '@/lib/dossier/synthesize'

export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const dossier = await prisma.contactDossier.findFirst({
      where: { contactId: id },
      orderBy: { version: 'desc' },
      select: {
        id: true,
        version: true,
        content: true,
        updatedBy: true,
        createdAt: true,
      },
    })

    if (!dossier) {
      return NextResponse.json({ dossier: null, message: 'No dossier exists yet' })
    }

    return NextResponse.json({ dossier })
  } catch (error) {
    console.error('[Dossier] GET error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    let mode: 'incremental' | 'full' = 'full'
    let newContext: string | undefined

    try {
      const body = await request.json()
      if (body.mode === 'incremental') mode = 'incremental'
      if (body.newContext) newContext = body.newContext
    } catch {
      // No body — default to full
    }

    const result = await synthesizeDossier(id, mode, newContext)

    // Fetch the newly created dossier content
    const dossier = await prisma.contactDossier.findUnique({
      where: { id: result.dossierId },
      select: {
        id: true,
        version: true,
        content: true,
        updatedBy: true,
        createdAt: true,
      },
    })

    return NextResponse.json({
      success: true,
      dossier,
      mode: result.mode,
      version: result.version,
    })
  } catch (error) {
    console.error('[Dossier] POST error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
