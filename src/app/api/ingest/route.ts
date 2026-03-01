/**
 * POST /api/ingest
 *
 * Unified intake endpoint for the ingestion pipeline.
 * Accepts content from any source (email, iMessage, voice, manual),
 * runs contact matching + dedup, sends to Claude for extraction,
 * and writes to the ingestion_items queue for review.
 *
 * Nothing touches the real database until the user confirms in the review queue.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { extractFromContent } from '@/lib/ingestion/extract'
import { matchContact, contentHash, isDuplicate } from '@/lib/ingestion/contact-match'
import type { IngestRequest, IngestionSource } from '@/types'

export const dynamic = 'force-dynamic'

const VALID_SOURCES: IngestionSource[] = [
  'email', 'imessage_auto', 'ios_shortcut', 'voice', 'signal_forward', 'manual'
]

/**
 * Parse forwarded email to extract original headers and body.
 */
function parseForwardedEmail(raw: string): {
  body: string
  headers: {
    from?: string
    to?: string
    subject?: string
    date?: string
  }
} {
  // Detect Gmail-style forwarding
  const fwdMarker = raw.indexOf('---------- Forwarded message ----------')
  if (fwdMarker === -1) {
    // Try Outlook-style
    const outlookMarker = raw.indexOf('-----Original Message-----')
    if (outlookMarker === -1) {
      return { body: raw, headers: {} }
    }
  }

  const marker = raw.indexOf('---------- Forwarded message ----------') !== -1
    ? '---------- Forwarded message ----------'
    : '-----Original Message-----'

  const afterMarker = raw.substring(raw.indexOf(marker) + marker.length)

  const headers: Record<string, string> = {}
  const headerLines: string[] = []
  const lines = afterMarker.split('\n')
  let bodyStart = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (line === '') {
      bodyStart = i + 1
      break
    }
    const match = line.match(/^(From|To|Date|Subject|Cc):\s*(.+)/i)
    if (match) {
      headers[match[1].toLowerCase()] = match[2].trim()
      headerLines.push(line)
    } else if (headerLines.length > 0) {
      bodyStart = i
      break
    }
  }

  const body = lines.slice(bodyStart).join('\n').trim()

  return {
    body,
    headers: {
      from: headers.from,
      to: headers.to,
      subject: headers.subject,
      date: headers.date,
    },
  }
}

/**
 * Extract email signature from body.
 * Simple heuristic: look for common signature markers.
 */
function parseSignature(body: string): {
  cleanBody: string
  signature: {
    name?: string
    title?: string
    org?: string
    phone?: string
    email?: string
  } | null
} {
  // Common signature separators
  const sigMarkers = [
    /^--\s*$/m,
    /^_{3,}$/m,
    /^-{3,}$/m,
    /^Sent from my /m,
    /^Best,?\s*$/mi,
    /^Regards,?\s*$/mi,
    /^Thanks,?\s*$/mi,
    /^Sincerely,?\s*$/mi,
    /^Cheers,?\s*$/mi,
  ]

  let sigStart = -1
  for (const marker of sigMarkers) {
    const match = body.match(marker)
    if (match && match.index !== undefined) {
      // Only consider it a signature if it's in the last 40% of the email
      if (match.index > body.length * 0.6) {
        if (sigStart === -1 || match.index < sigStart) {
          sigStart = match.index
        }
      }
    }
  }

  if (sigStart === -1) {
    return { cleanBody: body, signature: null }
  }

  const sigBlock = body.substring(sigStart)
  const cleanBody = body.substring(0, sigStart).trim()

  // Try to extract structured data from signature
  const signature: { name?: string; title?: string; org?: string; phone?: string; email?: string } = {}

  const sigLines = sigBlock.split('\n').map(l => l.trim()).filter(l => l.length > 0)

  // Phone pattern
  const phoneMatch = sigBlock.match(/(?:\+?1[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}/)
  if (phoneMatch) signature.phone = phoneMatch[0]

  // Email pattern
  const emailMatch = sigBlock.match(/[\w.+-]+@[\w.-]+\.\w{2,}/)
  if (emailMatch) signature.email = emailMatch[0]

  // First non-marker line is likely the name
  for (const line of sigLines) {
    if (line.match(/^(--|__|---|-{3,}|Sent from|Best|Regards|Thanks|Sincerely|Cheers)/i)) continue
    if (!line.match(/@|http|www\.|tel:|fax:|phone|mobile/i) && line.length < 50) {
      if (!signature.name) {
        signature.name = line.replace(/,\s*$/, '')
      } else if (!signature.title && !signature.org) {
        // Second line could be title or org
        signature.title = line
      }
      break
    }
  }

  return {
    cleanBody,
    signature: Object.keys(signature).length > 0 ? signature : null,
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: IngestRequest = await request.json()
    const { source, contactHint, content, metadata } = body

    // Validate source
    if (!source || !VALID_SOURCES.includes(source)) {
      return NextResponse.json(
        { error: `Invalid source. Must be one of: ${VALID_SOURCES.join(', ')}` },
        { status: 400 }
      )
    }

    // Need content or audio
    if (!content && !body.audioBase64) {
      return NextResponse.json(
        { error: 'Either content or audioBase64 is required' },
        { status: 400 }
      )
    }

    // If audio, we'd route to Whisper transcription here.
    // For now, voice sources must provide content (transcript).
    let processedContent = content || ''

    if (body.audioBase64 && !content) {
      // TODO: Route to Whisper transcription (Mac Mini local)
      return NextResponse.json(
        { error: 'Audio transcription not yet implemented. Provide content (transcript) directly.' },
        { status: 501 }
      )
    }

    // ── Email Parsing ──
    let parsedMetadata = metadata || {}
    if (source === 'email' && processedContent) {
      const parsed = parseForwardedEmail(processedContent)
      if (parsed.headers.from || parsed.headers.subject) {
        processedContent = parsed.body
        parsedMetadata = {
          ...parsedMetadata,
          originalFrom: parsed.headers.from || parsedMetadata.originalFrom,
          originalTo: parsed.headers.to || parsedMetadata.originalTo,
          subject: parsed.headers.subject || parsedMetadata.subject,
        }
      }

      // Parse signature
      const sigResult = parseSignature(processedContent)
      processedContent = sigResult.cleanBody
      if (sigResult.signature) {
        parsedMetadata.signature = {
          ...parsedMetadata.signature,
          ...sigResult.signature,
        }
      }
    }

    // ── Dedup Check ──
    const hash = contentHash(processedContent, source)
    const duplicate = await isDuplicate(hash, metadata?.threadId)
    if (duplicate) {
      return NextResponse.json(
        { message: 'Duplicate content detected — already in queue', duplicate: true },
        { status: 200 }
      )
    }

    // ── Contact Matching ──
    const match = await matchContact(contactHint, {
      originalFrom: parsedMetadata.originalFrom,
      originalTo: parsedMetadata.originalTo,
      signature: parsedMetadata.signature,
    })

    // ── Build Context for Claude ──
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

    // ── Claude Extraction ──
    const extraction = await extractFromContent(processedContent, {
      source,
      contactName: match.contactName || undefined,
      contactOrg: match.contactOrg || undefined,
      contactTier: match.contactTier || undefined,
      recentInteractions,
      existingCommitments,
      metadata: parsedMetadata,
    })

    // ── Write to Queue ──
    const item = await prisma.ingestionItem.create({
      data: {
        source,
        itemType: extraction.itemType,
        rawContent: processedContent,
        contactId: match.contactId,
        contactHint: contactHint || parsedMetadata.originalFrom || null,
        extraction: JSON.stringify(extraction),
        status: 'pending',
        contentHash: hash,
        threadId: metadata?.threadId || null,
      },
    })

    console.log(`[Ingestion] Item created: ${item.id} | source=${source} | type=${extraction.itemType} | contact=${match.contactName || 'unknown'}`)

    return NextResponse.json({
      id: item.id,
      itemType: extraction.itemType,
      contactMatch: match.contactName
        ? { name: match.contactName, method: match.matchMethod, confidence: match.confidence }
        : null,
      summary: extraction.summary.slice(0, 200),
    })
  } catch (error) {
    console.error('[Ingestion] Error:', error)
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
