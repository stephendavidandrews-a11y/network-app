/**
 * POST /api/inbox/[id]/undo
 *
 * Undoes a confirmed ingestion item by deleting all records
 * tracked in its manifest. Atomically cascading undo.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import type { ConfirmManifest } from '@/types'

export const dynamic = 'force-dynamic'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const item = await prisma.ingestionItem.findUnique({
      where: { id },
      select: { id: true, status: true, manifest: true },
    })

    if (!item) {
      return NextResponse.json({ error: 'Ingestion item not found' }, { status: 404 })
    }

    if (item.status !== 'confirmed' && item.status !== 'edited') {
      return NextResponse.json(
        { error: `Cannot undo — item is ${item.status}, not confirmed` },
        { status: 400 }
      )
    }

    if (!item.manifest) {
      return NextResponse.json(
        { error: 'No manifest found — nothing to undo' },
        { status: 400 }
      )
    }

    const undone = await prisma.$transaction(async (tx) => {
      const manifest: ConfirmManifest = JSON.parse(item.manifest)
      const undone: string[] = []

      // Delete in reverse dependency order

      // Provenance
      if (manifest.provenanceId) {
        await tx.contactProvenance.delete({
          where: { id: manifest.provenanceId },
        }).catch(() => {
          // May already be deleted
        })
        undone.push('1 provenance link')
      }

      // Relationships
      if (manifest.relationshipIds && manifest.relationshipIds.length > 0) {
        await tx.contactRelationship.deleteMany({
          where: { id: { in: manifest.relationshipIds } },
        })
        undone.push(`${manifest.relationshipIds.length} relationships`)
      }

      // Scheduling leads
      if (manifest.schedulingLeadIds && manifest.schedulingLeadIds.length > 0) {
        await tx.schedulingLead.deleteMany({
          where: { id: { in: manifest.schedulingLeadIds } },
        })
        undone.push(`${manifest.schedulingLeadIds.length} scheduling leads`)
      }

      // Standing offers
      if (manifest.standingOfferIds && manifest.standingOfferIds.length > 0) {
        await tx.standingOffer.deleteMany({
          where: { id: { in: manifest.standingOfferIds } },
        })
        undone.push(`${manifest.standingOfferIds.length} standing offers`)
      }

      // Signals
      if (manifest.signalIds && manifest.signalIds.length > 0) {
        await tx.intelligenceSignal.deleteMany({
          where: { id: { in: manifest.signalIds } },
        })
        undone.push(`${manifest.signalIds.length} signals`)
      }

      // Commitments (must be before interaction since they FK to it)
      if (manifest.commitmentIds && manifest.commitmentIds.length > 0) {
        await tx.commitment.deleteMany({
          where: { id: { in: manifest.commitmentIds } },
        })
        undone.push(`${manifest.commitmentIds.length} commitments`)
      }

      // Interaction
      if (manifest.interactionId) {
        await tx.interaction.delete({
          where: { id: manifest.interactionId },
        }).catch(() => {
          // May already be cascade-deleted
        })
        undone.push('1 interaction')
      }

      // New contact stubs
      if (manifest.contactIds && manifest.contactIds.length > 0) {
        // Only delete contacts that were created by this ingestion (safety check)
        await tx.contact.deleteMany({
          where: {
            id: { in: manifest.contactIds },
            source: 'ingestion',
          },
        })
        undone.push(`${manifest.contactIds.length} contact stubs`)
      }

      // Reset item status back to pending
      await tx.ingestionItem.update({
        where: { id },
        data: {
          status: 'pending',
          manifest: null,
          reviewedAt: null,
        },
      })

      // Log the undo as a learning signal
      await tx.learningSignal.create({
        data: {
          ingestionItemId: id,
          action: 'auto_override',
          editDetails: JSON.stringify({ undone }),
        },
      })
      return undone
    }) // end transaction

    console.log(`[Inbox] Undone item ${id}: ${undone.join(', ')}`)

    return NextResponse.json({
      success: true,
      undone,
    })
  } catch (error) {
    console.error('[Inbox] Undo error:', error)
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
