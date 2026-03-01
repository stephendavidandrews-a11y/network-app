/**
 * POST /api/inbox/rematch
 *
 * Re-parses raw_content for ingestion items with null contactId
 * and attempts to match them to contacts using the updated parser.
 *
 * This fixes items that were ingested before the Gmail forwarding
 * format was properly detected — they all have contact_hint="Stephen Andrews"
 * because the parser couldn't extract the real sender.
 *
 * Safe to run multiple times — only touches items with null contactId.
 */

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { matchContact } from '@/lib/ingestion/contact-match'

export const dynamic = 'force-dynamic'

/**
 * Parse forwarded email headers from raw content.
 * Handles both multi-line and collapsed single-line formats.
 */
function extractForwardedHeaders(text: string): {
  from: string | null
  to: string | null
  subject: string | null
} {
  let from: string | null = null
  let to: string | null = null
  let subject: string | null = null

  // Standard forwarding markers
  const fwdPatterns = [
    '---------- Forwarded message ----------',
    '---------- Forwarded message ---------',
    '-----Original Message-----',
    '--- Forwarded message ---',
  ]

  let detected = false

  for (const pattern of fwdPatterns) {
    const idx = text.indexOf(pattern)
    if (idx !== -1) {
      const afterMarker = text.substring(idx + pattern.length).trim()
      const hasNewlines = afterMarker.includes('\n')

      if (hasNewlines) {
        const lines = afterMarker.split('\n')
        for (const line of lines) {
          const trimmed = line.trim()
          if (trimmed === '') break
          const headerMatch = trimmed.match(/^(From|To|Subject):\s*(.+)/i)
          if (headerMatch) {
            const key = headerMatch[1].toLowerCase()
            const val = headerMatch[2].trim()
            if (key === 'from') from = val
            if (key === 'to') to = val
            if (key === 'subject') subject = val
          }
        }
      } else {
        // Collapsed single-line: use regex
        const fromMatch = afterMarker.match(/From:\s*(.*?)(?=\s+Date:)/i)
        const toMatch = afterMarker.match(/\bTo:\s*(.*?)(?=\s+(?:Cc|Subject|Date):)/i)
        const subjectMatch = afterMarker.match(/Subject:\s*(.*?)(?=\s+(?:To|Cc|From):)/i)
        if (fromMatch) from = fromMatch[1].trim()
        if (toMatch) to = toMatch[1].trim()
        if (subjectMatch) subject = subjectMatch[1].trim()
      }

      detected = true
      break
    }
  }

  // Gmail compact: "------ From: Name Date: ..."
  if (!detected) {
    const gmailMatch = text.match(/-{3,}\s*From:\s*/m)
    if (gmailMatch && gmailMatch.index != null) {
      const afterDashes = text.substring(gmailMatch.index)
      const fromMatch = afterDashes.match(/From:\s*(.*?)(?=\s+Date:)/i)
      const toMatch = afterDashes.match(/\bTo:\s*(.*?)(?=\s+(?:Cc|Subject|Date):)/i)
      const subjectMatch = afterDashes.match(/Subject:\s*(.*?)(?=\s+(?:To|Cc|From):)/i)
      if (fromMatch) from = fromMatch[1].trim()
      if (toMatch) to = toMatch[1].trim()
      if (subjectMatch) subject = subjectMatch[1].trim()
    }
  }

  return { from, to, subject }
}

/**
 * Extract email address from "Name <email>" format
 */
function extractEmail(addr: string): string {
  const match = addr.match(/<([^>]+)>/)
  return match ? match[1] : addr.trim()
}

/**
 * Extract display name from "Name <email>" format
 */
function extractName(addr: string): string | null {
  const match = addr.match(/^([^<]+)</)
  return match ? match[1].trim().replace(/["']/g, '') : null
}

export async function POST() {
  try {
    // Find items with null contactId (failed matches)
    const items = await prisma.ingestionItem.findMany({
      where: {
        contactId: null,
        source: { in: ['email', 'voice', 'manual', 'ios_shortcut'] },
      },
      select: {
        id: true,
        source: true,
        rawContent: true,
        contactHint: true,
        status: true,
      },
      orderBy: { createdAt: 'asc' },
    })

    console.log(`[Rematch] Found ${items.length} items with null contactId`)

    const results: Array<{ id: string; oldHint: string | null; newHint: string | null; matched: string | null; action: string }> = []
    let matched = 0
    let unchanged = 0

    for (const item of items) {
      const rawContent = item.rawContent || ''

      // Re-parse forwarded headers from raw content
      const headers = extractForwardedHeaders(rawContent)

      // Build from address
      const fromAddr = headers.from || null

      // Build new contact hint
      let newHint: string | undefined
      if (fromAddr) {
        newHint = extractName(fromAddr) || extractEmail(fromAddr)
      }

      // Also extract signature email if present
      let sigEmail: string | undefined
      const sigEmailMatch = rawContent.match(/[\w.+-]+@[\w.-]+\.(?:gov|com|org|net|edu)\b/i)
      // Don't use Stephen's own email addresses
      if (sigEmailMatch && !sigEmailMatch[0].toLowerCase().includes('stephen')) {
        sigEmail = sigEmailMatch[0]
      }

      // Skip if we got the same hint as before and no signature email
      if ((!newHint || newHint === item.contactHint) && !sigEmail) {
        unchanged++
        results.push({
          id: item.id,
          oldHint: item.contactHint,
          newHint: newHint || null,
          matched: null,
          action: 'unchanged — same hint, no new data',
        })
        continue
      }

      // Try matching with new hint
      const matchResult = await matchContact(newHint, {
        originalFrom: fromAddr || undefined,
        signature: sigEmail ? { email: sigEmail } : undefined,
      })

      if (matchResult.contactId) {
        // Update the ingestion item
        await prisma.ingestionItem.update({
          where: { id: item.id },
          data: {
            contactId: matchResult.contactId,
            contactHint: newHint || item.contactHint,
          },
        })

        matched++
        results.push({
          id: item.id,
          oldHint: item.contactHint,
          newHint: newHint || null,
          matched: `${matchResult.contactName} (${matchResult.matchMethod}, ${matchResult.confidence})`,
          action: `matched → ${matchResult.contactName}`,
        })
      } else {
        // Update hint even if no match, so we have better data
        if (newHint && newHint !== item.contactHint) {
          await prisma.ingestionItem.update({
            where: { id: item.id },
            data: { contactHint: newHint },
          })
        }

        unchanged++
        results.push({
          id: item.id,
          oldHint: item.contactHint,
          newHint: newHint || null,
          matched: null,
          action: `updated hint but no contact match (tried: ${newHint || 'none'}, sig: ${sigEmail || 'none'})`,
        })
      }
    }

    console.log(`[Rematch] Done: ${matched} matched, ${unchanged} unchanged, ${items.length} total`)

    return NextResponse.json({
      success: true,
      matched,
      unchanged,
      total: items.length,
      results,
    })
  } catch (error) {
    console.error('[Rematch] Error:', error)
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
