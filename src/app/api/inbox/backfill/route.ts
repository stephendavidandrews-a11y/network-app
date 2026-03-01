/**
 * POST /api/inbox/backfill
 *
 * One-shot script to backfill interaction records for already-confirmed
 * ingestion items that are missing them (due to the old confirm route
 * only creating interactions for itemType === 'interaction').
 *
 * Also fixes lastInteractionDate and contact status for affected contacts.
 *
 * Safe to run multiple times — skips items that already have an interaction
 * in their manifest.
 */

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import type { IngestionExtraction, ConfirmManifest } from '@/types'

export const dynamic = 'force-dynamic'

export async function POST() {
  try {
    // Find all confirmed/edited items that don't have an interactionId in their manifest
    const confirmedItems = await prisma.ingestionItem.findMany({
      where: {
        status: { in: ['confirmed', 'edited'] },
        contactId: { not: null },
      },
      include: {
        contact: { select: { id: true, name: true, status: true, lastInteractionDate: true } },
      },
      orderBy: { createdAt: 'asc' },
    })

    const results: Array<{ id: string; contact: string; action: string }> = []
    let created = 0
    let skipped = 0
    let statusFixed = 0

    for (const item of confirmedItems) {
      if (!item.contactId || !item.contact) {
        skipped++
        continue
      }

      // Parse manifest and extraction
      const manifest: ConfirmManifest = item.manifest ? JSON.parse(item.manifest) : {}
      const extraction: IngestionExtraction = JSON.parse(item.extraction)

      // Skip if interaction already exists in manifest
      if (manifest.interactionId) {
        // But still check if lastInteractionDate needs fixing
        if (!item.contact.lastInteractionDate) {
          const date = resolveDate(item)
          await prisma.contact.update({
            where: { id: item.contactId },
            data: { lastInteractionDate: date },
          })
          results.push({ id: item.id, contact: item.contact.name, action: `fixed lastInteractionDate → ${date}` })
        }
        skipped++
        continue
      }

      // Skip irrelevant items
      if (extraction.itemType === 'irrelevant') {
        skipped++
        continue
      }

      // Create the missing interaction
      const interactionType = resolveType(item.source, item.rawContent)
      const interactionDate = resolveDate(item)

      const legacyCommitments = (extraction.myCommitments || []).map(c => ({
        description: c.description,
        due_date: c.resolvedDate,
        fulfilled: false,
        fulfilled_date: null,
      }))

      const newContactsMentioned = (extraction.newContactsMentioned || []).map(nc => ({
        name: nc.name,
        organization: nc.org,
        context: nc.context,
      }))

      const interaction = await prisma.interaction.create({
        data: {
          contactId: item.contactId,
          type: interactionType,
          date: interactionDate,
          summary: extraction.summary || 'No summary available',
          commitments: JSON.stringify(legacyCommitments),
          newContactsMentioned: JSON.stringify(newContactsMentioned),
          followUpRequired: (extraction.asks || []).length > 0,
          followUpDescription: (extraction.asks || []).length > 0
            ? extraction.asks.map(a => `[${a.direction === 'from_me' ? 'I asked' : 'They asked'}] ${a.description}`).join('; ')
            : null,
          sentiment: extraction.sentiment || null,
          relationshipDelta: extraction.relationshipDelta || null,
          relationshipNotes: extraction.relationshipNotes || null,
          topicsDiscussed: JSON.stringify(extraction.topicsDiscussed || []),
          source: item.source === 'voice' ? 'voice_debrief' : item.source === 'email' ? 'email_parsed' : 'system',
          sourceIngestionId: item.id,
        },
      })

      // Update manifest
      manifest.interactionId = interaction.id
      await prisma.ingestionItem.update({
        where: { id: item.id },
        data: { manifest: JSON.stringify(manifest) },
      })

      // Create commitments that were missed
      const commitmentIds: string[] = []
      for (const c of (extraction.myCommitments || [])) {
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
      for (const c of (extraction.theirCommitments || [])) {
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
        await prisma.ingestionItem.update({
          where: { id: item.id },
          data: { manifest: JSON.stringify(manifest) },
        })
      }

      // Fix lastInteractionDate
      await prisma.contact.update({
        where: { id: item.contactId },
        data: { lastInteractionDate: interactionDate },
      })

      // Fix contact status
      const currentStatus = item.contact.status
      if (currentStatus === 'target' || currentStatus === 'outreach_sent') {
        await prisma.contact.update({
          where: { id: item.contactId },
          data: { status: 'active' },
        })
        statusFixed++
      } else if (currentStatus === 'cold' || currentStatus === 'dormant') {
        await prisma.contact.update({
          where: { id: item.contactId },
          data: { status: 'warm' },
        })
        statusFixed++
      }

      created++
      results.push({
        id: item.id,
        contact: item.contact.name,
        action: `created interaction (${interactionType}, ${interactionDate})${commitmentIds.length > 0 ? ` + ${commitmentIds.length} commitments` : ''}`,
      })
    }

    console.log(`[Backfill] Done: ${created} interactions created, ${skipped} skipped, ${statusFixed} statuses fixed`)

    return NextResponse.json({
      success: true,
      created,
      skipped,
      statusFixed,
      total: confirmedItems.length,
      results,
    })
  } catch (error) {
    console.error('[Backfill] Error:', error)
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

function resolveType(source: string, rawContent: string): string {
  switch (source) {
    case 'email': {
      const fromMatch = rawContent.match(/From:\s*(.+)/i)
      if (fromMatch) {
        const from = fromMatch[1].toLowerCase()
        if (from.includes('stephenandrews') || from.includes('stephen andrews') || from.includes('stephen.andrews')) {
          return 'email_sent'
        }
      }
      return 'email_received'
    }
    case 'imessage_auto': return 'text_message'
    case 'voice': return 'meeting'
    case 'ios_shortcut': return 'other'
    case 'signal_forward': return 'other'
    case 'manual': return 'other'
    default: return 'other'
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function resolveDate(item: any): string {
  if (item.source === 'email' && item.rawContent) {
    const dateMatch = item.rawContent.match(/Date:\s*(.+)/i)
    if (dateMatch) {
      try {
        const parsed = new Date(dateMatch[1].trim())
        if (!isNaN(parsed.getTime())) {
          return parsed.toISOString().split('T')[0]
        }
      } catch {
        // Fall through
      }
    }
  }
  const createdAt = typeof item.createdAt === 'string' ? item.createdAt : item.createdAt.toISOString()
  return createdAt.split('T')[0]
}
