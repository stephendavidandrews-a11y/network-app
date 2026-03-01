/**
 * Core Ingestion Processing
 *
 * Shared logic used by both /api/ingest (HTTP) and the email poller (cron job).
 * Takes raw content and runs the full pipeline:
 *   contact match → dedup → Claude extraction → write to queue
 */

import { prisma } from '@/lib/db'
import { extractFromContent } from './extract'
import { matchContact, contentHash, isDuplicate } from './contact-match'
import type { IngestionSource } from '@/types'

export interface ProcessResult {
  id: string
  itemType: string
  contactName: string | null
  duplicate: boolean
  summary: string
}

export async function processIngestion(params: {
  source: IngestionSource
  content: string
  contactHint?: string
  metadata?: {
    originalFrom?: string
    originalTo?: string
    subject?: string
    forwardedFrom?: string
    threadId?: string
    groupParticipants?: number
    signature?: {
      name?: string
      title?: string
      org?: string
      phone?: string
      email?: string
    }
  }
}): Promise<ProcessResult> {
  const { source, content, contactHint, metadata } = params

  // Dedup
  const hash = contentHash(content, source)
  const duplicate = await isDuplicate(hash, metadata?.threadId)
  if (duplicate) {
    return {
      id: '',
      itemType: '',
      contactName: null,
      duplicate: true,
      summary: 'Duplicate content — already in queue',
    }
  }

  // Contact match
  const match = await matchContact(contactHint, {
    originalFrom: metadata?.originalFrom,
    originalTo: metadata?.originalTo,
    signature: metadata?.signature,
  })

  // Build context
  let recentInteractions: Array<{ date: string; type: string; summary: string | null }> = []
  let existingCommitments: Array<{ description: string; dueDate: string | null }> = []

  if (match.contactId) {
    const interactions = await prisma.interaction.findMany({
      where: { contactId: match.contactId },
      orderBy: { date: 'desc' },
      take: 5,
      select: { date: true, type: true, summary: true },
    })
    recentInteractions = interactions

    const commitments = await prisma.commitment.findMany({
      where: { contactId: match.contactId, fulfilled: false },
      orderBy: { dueDate: 'asc' },
      select: { description: true, dueDate: true },
    })
    existingCommitments = commitments
  }

  // Claude extraction
  const extraction = await extractFromContent(content, {
    source,
    contactName: match.contactName || undefined,
    contactOrg: match.contactOrg || undefined,
    contactTier: match.contactTier || undefined,
    recentInteractions,
    existingCommitments,
    metadata,
  })

  // Write to queue
  const item = await prisma.ingestionItem.create({
    data: {
      source,
      itemType: extraction.itemType,
      rawContent: content,
      contactId: match.contactId,
      contactHint: contactHint || metadata?.originalFrom || null,
      extraction: JSON.stringify(extraction),
      status: 'pending',
      contentHash: hash,
      threadId: metadata?.threadId || null,
    },
  })

  console.log(`[Ingestion] Item created: ${item.id} | source=${source} | type=${extraction.itemType} | contact=${match.contactName || 'unknown'}`)

  return {
    id: item.id,
    itemType: extraction.itemType,
    contactName: match.contactName,
    duplicate: false,
    summary: extraction.summary.slice(0, 200),
  }
}
