/**
 * POST /api/inbox/[id]/confirm
 *
 * Confirms an ingestion item, writing all extracted data to the real database.
 * Tracks a manifest of everything created for atomic undo.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { synthesizeDossier } from '@/lib/dossier/synthesize'
import type { IngestionExtraction, ConfirmManifest } from '@/types'

export const dynamic = 'force-dynamic'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Optionally accept an edited extraction
    let editedExtraction: IngestionExtraction | null = null
    try {
      const body = await request.json()
      if (body.extraction) {
        editedExtraction = body.extraction as IngestionExtraction
      }
    } catch {
      // No body — use stored extraction
    }

    const item = await prisma.ingestionItem.findUnique({
      where: { id },
      include: {
        contact: { select: { id: true, name: true } },
      },
    })

    if (!item) {
      return NextResponse.json({ error: 'Ingestion item not found' }, { status: 404 })
    }

    if (item.status === 'confirmed' || item.status === 'edited') {
      return NextResponse.json({ error: 'Item already confirmed' }, { status: 400 })
    }

    const extraction: IngestionExtraction = editedExtraction || JSON.parse(item.extraction)
    const manifest: ConfirmManifest = {}
    const now = new Date().toISOString()

    // ── 1. Create Interaction (for interaction-type items) ──
    if (extraction.itemType === 'interaction' && item.contactId) {
      const interactionType = sourceToInteractionType(item.source)

      // Build legacy commitments JSON for backward compat
      const legacyCommitments = extraction.myCommitments.map(c => ({
        description: c.description,
        due_date: c.resolvedDate,
        fulfilled: false,
        fulfilled_date: null,
      }))

      const newContactsMentioned = extraction.newContactsMentioned.map(nc => ({
        name: nc.name,
        organization: nc.org,
        context: nc.context,
      }))

      const interaction = await prisma.interaction.create({
        data: {
          contactId: item.contactId,
          type: interactionType,
          date: item.createdAt.split('T')[0],
          summary: extraction.summary,
          commitments: JSON.stringify(legacyCommitments),
          newContactsMentioned: JSON.stringify(newContactsMentioned),
          followUpRequired: extraction.asks.length > 0,
          followUpDescription: extraction.asks.length > 0
            ? extraction.asks.map(a => a.description).join('; ')
            : null,
          source: item.source === 'voice' ? 'voice_debrief' : item.source === 'email' ? 'email_parsed' : 'system',
          sourceIngestionId: item.id,
        },
      })
      manifest.interactionId = interaction.id

      // Update contact's lastInteractionDate
      await prisma.contact.update({
        where: { id: item.contactId },
        data: { lastInteractionDate: interaction.date },
      })

      // ── 2. Create Commitments ──
      const commitmentIds: string[] = []

      for (const c of extraction.myCommitments) {
        const commitment = await prisma.commitment.create({
          data: {
            interactionId: interaction.id,
            contactId: item.contactId,
            description: `[Mine] ${c.description}`,
            dueDate: c.resolvedDate,
          },
        })
        commitmentIds.push(commitment.id)
      }

      for (const c of extraction.theirCommitments) {
        const commitment = await prisma.commitment.create({
          data: {
            interactionId: interaction.id,
            contactId: item.contactId,
            description: `[Theirs] ${c.description}`,
            dueDate: c.resolvedDate,
          },
        })
        commitmentIds.push(commitment.id)
      }

      if (commitmentIds.length > 0) {
        manifest.commitmentIds = commitmentIds
      }
    }

    // ── 3. Create Intelligence Signals ──
    if (extraction.orgIntelligence.length > 0 && item.contactId) {
      const signalIds: string[] = []

      for (const intel of extraction.orgIntelligence) {
        const signal = await prisma.intelligenceSignal.create({
          data: {
            contactId: item.contactId,
            signalType: 'other',
            title: `${intel.organization}: ${intel.intelligence.slice(0, 100)}`,
            description: intel.intelligence,
            sourceName: intel.source,
            sourceIngestionId: item.id,
          },
        })
        signalIds.push(signal.id)
      }

      // Status changes also create signals
      for (const sc of extraction.statusChanges) {
        if (!item.contactId) continue
        const signal = await prisma.intelligenceSignal.create({
          data: {
            contactId: item.contactId,
            signalType: sc.changeType === 'job_change' ? 'job_change' : 'other',
            title: sc.description.slice(0, 200),
            description: `${sc.from ? `From: ${sc.from}` : ''} ${sc.to ? `To: ${sc.to}` : ''} — ${sc.description}`,
            sourceIngestionId: item.id,
          },
        })
        signalIds.push(signal.id)
      }

      if (signalIds.length > 0) {
        manifest.signalIds = signalIds
      }
    }

    // ── 4. Create Standing Offers ──
    if (extraction.offers.length > 0 && item.contactId) {
      const offerIds: string[] = []

      for (const offer of extraction.offers) {
        const created = await prisma.standingOffer.create({
          data: {
            contactId: item.contactId,
            description: offer.description,
            offeredBy: offer.offeredBy,
            originalWords: offer.originalWords,
            sourceIngestionId: item.id,
          },
        })
        offerIds.push(created.id)
      }

      manifest.standingOfferIds = offerIds
    }

    // ── 5. Create Scheduling Leads ──
    if (extraction.schedulingLeads.length > 0 && item.contactId) {
      const leadIds: string[] = []

      for (const lead of extraction.schedulingLeads) {
        const created = await prisma.schedulingLead.create({
          data: {
            contactId: item.contactId,
            description: lead.description,
            originalWords: lead.originalWords,
            timeframe: lead.timeframe,
            sourceIngestionId: item.id,
          },
        })
        leadIds.push(created.id)
      }

      manifest.schedulingLeadIds = leadIds
    }

    // ── 6. Create New Contact Stubs ──
    if (extraction.newContactsMentioned.length > 0) {
      const contactIds: string[] = []

      for (const nc of extraction.newContactsMentioned) {
        if (!nc.name || nc.name.trim().length < 2) continue

        // Check if contact already exists
        const existing = await prisma.contact.findFirst({
          where: { name: { equals: nc.name } },
          select: { id: true },
        })
        if (existing) continue

        const stub = await prisma.contact.create({
          data: {
            name: nc.name,
            organization: nc.org,
            title: nc.title,
            email: nc.email,
            phone: nc.phone,
            tier: 3,
            notes: nc.context,
            source: 'ingestion',
            discoveredVia: item.contact?.name || item.contactHint || 'ingestion',
          },
        })
        contactIds.push(stub.id)
      }

      if (contactIds.length > 0) {
        manifest.contactIds = contactIds
      }
    }

    // ── 7. Create Observed Connections ──
    if (extraction.observedConnections.length > 0) {
      const relationshipIds: string[] = []

      for (const conn of extraction.observedConnections) {
        // Find both contacts
        const contactA = await prisma.contact.findFirst({
          where: { name: { contains: conn.person1 } },
          select: { id: true },
        })
        const contactB = await prisma.contact.findFirst({
          where: { name: { contains: conn.person2 } },
          select: { id: true },
        })

        if (contactA && contactB && contactA.id !== contactB.id) {
          // Check if relationship already exists
          const existing = await prisma.contactRelationship.findFirst({
            where: {
              OR: [
                { contactAId: contactA.id, contactBId: contactB.id },
                { contactAId: contactB.id, contactBId: contactA.id },
              ],
            },
          })

          if (existing) {
            // Increment observation count
            await prisma.contactRelationship.update({
              where: { id: existing.id },
              data: {
                observationCount: existing.observationCount + 1,
                lastObserved: now,
                observationSource: conn.source,
              },
            })
          } else {
            const strengthMap: Record<string, number> = {
              strong: 5,
              moderate: 3,
              weak: 2,
              unknown: 1,
            }

            const rel = await prisma.contactRelationship.create({
              data: {
                contactAId: contactA.id,
                contactBId: contactB.id,
                relationshipType: conn.nature,
                strength: strengthMap[conn.strength] || 1,
                source: 'inferred',
                observationSource: conn.source,
                lastObserved: now,
              },
            })
            relationshipIds.push(rel.id)
          }
        }
      }

      if (relationshipIds.length > 0) {
        manifest.relationshipIds = relationshipIds
      }
    }

    // ── Update Item Status ──
    const finalStatus = editedExtraction ? 'edited' : 'confirmed'
    await prisma.ingestionItem.update({
      where: { id },
      data: {
        status: finalStatus,
        extraction: editedExtraction ? JSON.stringify(editedExtraction) : undefined,
        manifest: JSON.stringify(manifest),
        reviewedAt: now,
      },
    })

    // ── Log Learning Signal ──
    await prisma.learningSignal.create({
      data: {
        ingestionItemId: id,
        action: editedExtraction ? 'edited' : 'confirmed',
        editDetails: editedExtraction ? JSON.stringify({ edited: true }) : null,
      },
    })

    console.log(`[Inbox] Confirmed item ${id} | manifest: ${JSON.stringify(manifest)}`)

    // Trigger incremental dossier update (fire-and-forget)
    if (item.contactId) {
      const summaryContext = extraction.summary || ''
      synthesizeDossier(item.contactId, 'incremental', summaryContext).catch(err => {
        console.error(`[Dossier] Incremental update failed for contact ${item.contactId}:`, err)
      })
    }

    return NextResponse.json({
      success: true,
      manifest,
      status: finalStatus,
    })
  } catch (error) {
    console.error('[Inbox] Confirm error:', error)
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

function sourceToInteractionType(source: string): string {
  switch (source) {
    case 'email': return 'email_received'
    case 'imessage_auto': return 'text_message'
    case 'voice': return 'meeting'
    case 'ios_shortcut': return 'other'
    case 'signal_forward': return 'other'
    case 'manual': return 'other'
    default: return 'other'
  }
}
