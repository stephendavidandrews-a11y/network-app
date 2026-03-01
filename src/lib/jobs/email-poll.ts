/**
 * Email Polling Job
 *
 * Connects to notes@stephenandrews.org via IMAP,
 * reads unread emails, parses forwarding headers,
 * and sends each to the ingestion pipeline.
 *
 * Runs every 5 minutes via scheduler or manually via /api/jobs/run.
 */

import { ImapFlow } from 'imapflow'
import { processIngestion } from '@/lib/ingestion/process'

interface EmailPollResult {
  processed: number
  skipped: number
  errors: number
  items: Array<{ subject: string; from: string; result: string }>
}

/**
 * Parse a raw email into structured parts.
 */
function parseEmail(text: string): {
  body: string
  from: string | null
  to: string | null
  subject: string | null
  signature: {
    name?: string
    title?: string
    org?: string
    phone?: string
    email?: string
  } | null
} {
  let body = text
  let from: string | null = null
  let to: string | null = null
  let subject: string | null = null

  // Detect forwarded email markers
  // Strategy: try exact string patterns first, then regex fallbacks for
  // Gmail's various forwarding formats (including quoted-printable artifacts)
  const fwdPatterns = [
    '---------- Forwarded message ----------',
    '---------- Forwarded message ---------',   // quoted-printable may truncate
    '-----Original Message-----',
    '--- Forwarded message ---',
  ]

  let fwdDetected = false

  for (const pattern of fwdPatterns) {
    const idx = text.indexOf(pattern)
    if (idx !== -1) {
      const afterMarker = text.substring(idx + pattern.length).trim()

      // Check if we have proper newlines (multi-line) or collapsed single-line text
      const hasNewlines = afterMarker.includes('\n')

      if (hasNewlines) {
        // Multi-line: parse headers line by line (original logic)
        const lines = afterMarker.split('\n')
        let bodyStart = 0

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim()
          if (line === '') {
            bodyStart = i + 1
            break
          }
          const headerMatch = line.match(/^(From|To|Date|Subject|Cc):\s*(.+)/i)
          if (headerMatch) {
            const key = headerMatch[1].toLowerCase()
            const val = headerMatch[2].trim()
            if (key === 'from') from = val
            if (key === 'to') to = val
            if (key === 'subject') subject = val
          }
        }

        body = lines.slice(bodyStart).join('\n').trim()
      } else {
        // Single-line (HTML was stripped + whitespace collapsed): use regex extraction
        const fromMatch = afterMarker.match(/From:\s*(.*?)(?=\s+Date:)/i)
        const toMatch = afterMarker.match(/\bTo:\s*(.*?)(?=\s+(?:Cc|Subject|Date):|\s{2,})/i)
        const subjectMatch = afterMarker.match(/Subject:\s*(.*?)(?=\s+(?:To|Cc|From):|\s{2,})/i)

        if (fromMatch) from = fromMatch[1].trim()
        if (toMatch) to = toMatch[1].trim()
        if (subjectMatch) subject = subjectMatch[1].trim()

        // Find body after headers
        const allHeaders = Array.from(afterMarker.matchAll(/\b(From|Date|Subject|To|Cc):\s*/gi))
        if (allHeaders.length > 0) {
          const lastHeader = allHeaders[allHeaders.length - 1]
          const afterLastHeader = afterMarker.substring(lastHeader.index! + lastHeader[0].length)
          // Look for body start: greeting or sentence-like text
          const bodyStartMatch = afterLastHeader.match(/(?:^|\s)(Hi\b|Hello\b|Dear\b|Good\s|Thank|I\s(?:am|hope|want|would|was)|Please\b|Hope\b|Just\b|Following\b|As\b|Per\b|We\b|This\b)/i)
          if (bodyStartMatch && bodyStartMatch.index != null) {
            body = afterLastHeader.substring(bodyStartMatch.index).trim()
          } else {
            body = afterLastHeader
          }
        }
      }

      fwdDetected = true
      break
    }
  }

  // Fallback: Gmail compact forwarding format
  // After HTML stripping + whitespace collapse, Gmail forwards look like:
  // "------ From: Name (Dept) Date: Tue, Feb 24, 2026 at 3:43 PM Subject: Title To: email Cc: ... Body text here"
  // Everything on one line because newlines were collapsed.
  // Also handles multi-line case where newlines are preserved.
  if (!fwdDetected) {
    const gmailCompactMatch = text.match(/-{3,}\s*From:\s*/m)
    if (gmailCompactMatch && gmailCompactMatch.index != null) {
      const afterDashes = text.substring(gmailCompactMatch.index)

      // Extract headers using regex — works for both collapsed single-line and multi-line
      // Each header value runs until the next recognized header keyword or end of headers
      const fromMatch = afterDashes.match(/From:\s*(.*?)(?=\s+Date:)/i)
      const toMatch = afterDashes.match(/\bTo:\s*(.*?)(?=\s+(?:Cc|Subject|Date):|\s{2,})/i)
      const subjectMatch = afterDashes.match(/Subject:\s*(.*?)(?=\s+(?:To|Cc|From):|\s{2,})/i)

      if (fromMatch) from = fromMatch[1].trim()
      if (toMatch) to = toMatch[1].trim()
      if (subjectMatch) subject = subjectMatch[1].trim()

      // Find body: everything after the last header
      // Find all known header keywords, take the last one's end position
      const allHeaders = Array.from(afterDashes.matchAll(/\b(From|Date|Subject|To|Cc):\s*/gi))
      if (allHeaders.length > 0) {
        const lastHeader = allHeaders[allHeaders.length - 1]
        const lastHeaderStart = lastHeader.index! + lastHeader[0].length

        // After the last header keyword, find where the header value ends and body begins
        // For Cc: it's a list of names/emails. Body typically starts with a greeting or sentence.
        // Heuristic: find the first sentence-like text after the last header
        const afterLastHeader = afterDashes.substring(lastHeaderStart)

        // Look for common greeting/body starters
        const bodyStartMatch = afterLastHeader.match(/(?:^|\s)(Hi\b|Hello\b|Dear\b|Good\s|Thank|I\s(?:am|hope|want|would|was)|Please\b|Hope\b|Just\b|Following\b|As\b|Per\b|We\b|This\b)/i)
        if (bodyStartMatch && bodyStartMatch.index != null) {
          body = afterLastHeader.substring(bodyStartMatch.index).trim()
        } else {
          // Fallback: skip a reasonable amount and take the rest
          body = afterLastHeader
        }
      }

      fwdDetected = true
    }
  }

  // Parse signature from body
  let signature: { name?: string; phone?: string; email?: string } | null = null
  const sigMarkers = [/^--\s*$/m, /^_{3,}$/m, /^Sent from my /m]

  for (const marker of sigMarkers) {
    const match = body.match(marker)
    if (match && match.index && match.index > body.length * 0.6) {
      const sigBlock = body.substring(match.index)

      const phoneMatch = sigBlock.match(/(?:\+?1[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}/)
      const emailMatch = sigBlock.match(/[\w.+-]+@[\w.-]+\.\w{2,}/)

      signature = {}
      if (phoneMatch) signature.phone = phoneMatch[0]
      if (emailMatch) signature.email = emailMatch[0]

      body = body.substring(0, match.index).trim()
      break
    }
  }

  return { body, from, to, subject, signature }
}

/**
 * Extract email address from a "Name <email>" string.
 */
function extractEmail(addr: string): string {
  const match = addr.match(/<([^>]+)>/)
  return match ? match[1] : addr.trim()
}

/**
 * Extract display name from a "Name <email>" string.
 */
function extractName(addr: string): string | null {
  const match = addr.match(/^([^<]+)</)
  return match ? match[1].trim().replace(/["']/g, '') : null
}

export async function runEmailPoll(): Promise<EmailPollResult> {
  const host = process.env.IMAP_HOST
  const user = process.env.IMAP_USER
  const pass = process.env.IMAP_PASS

  if (!host || !user || !pass) {
    console.log('[EmailPoll] IMAP not configured (missing IMAP_HOST/USER/PASS). Skipping.')
    return { processed: 0, skipped: 0, errors: 0, items: [] }
  }

  const result: EmailPollResult = { processed: 0, skipped: 0, errors: 0, items: [] }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = new ImapFlow({
    host,
    port: 993,
    secure: true,
    auth: { user, pass },
    logger: false,
    socketTimeout: 30000,
    greetingTimeout: 15000,
  } as any)

  try {
    await client.connect()
    console.log('[EmailPoll] Connected to IMAP')

    // Open inbox
    const lock = await client.getMailboxLock('INBOX')

    try {
      // Step 1: Light fetch — just envelopes + UIDs for unseen messages
      const envelopes: Array<{ uid: number; envelope: Record<string, unknown> }> = []
      const messages = client.fetch({ seen: false }, {
        envelope: true,
        uid: true,
      })

      for await (const msg of messages) {
        envelopes.push({ uid: msg.uid, envelope: msg.envelope as Record<string, unknown> })
      }

      console.log(`[EmailPoll] Found ${envelopes.length} unseen messages`)

      if (envelopes.length === 0) {
        lock.release()
        console.log('[EmailPoll] Done: 0 processed, 0 skipped, 0 errors')
        await client.logout()
        return result
      }

      // Step 2: Process each message individually
      for (const { uid, envelope } of envelopes) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const env = envelope as any

          // Download just the text content for this message
          let textContent = ''
          try {
            // Try text/plain first
            const download = await client.download(String(uid), undefined, { uid: true })
            if (download?.content) {
              const chunks: Buffer[] = []
              for await (const chunk of download.content) {
                chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
              }
              textContent = Buffer.concat(chunks).toString('utf-8')
            }
          } catch {
            console.log(`[EmailPoll] Could not download UID ${uid}, skipping`)
            result.skipped++
            result.items.push({
              subject: env?.subject || '(no subject)',
              from: env?.from?.[0]?.address || 'unknown',
              result: 'skipped — download failed',
            })
            continue
          }

          // Strip HTML tags if present
          textContent = textContent.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()

          if (textContent.length < 10) {
            result.skipped++
            result.items.push({
              subject: env?.subject || '(no subject)',
              from: env?.from?.[0]?.address || 'unknown',
              result: 'skipped — too short',
            })
            // Mark as seen so we don't retry
            await client.messageFlagsAdd({ uid }, ['\\Seen'], { uid: true })
            continue
          }

          // Parse the email content
          const parsed = parseEmail(textContent)

          console.log(`[EmailPoll] UID ${uid} parsed: from=${parsed.from}, to=${parsed.to}, subject=${parsed.subject}`)

          // Build metadata from envelope + parsed headers
          const fromAddr = parsed.from ||
            (env?.from?.[0] ? `${env.from[0].name || ''} <${env.from[0].address}>`.trim() : null)

          const contactHint = fromAddr
            ? extractName(fromAddr) || extractEmail(fromAddr)
            : undefined

          console.log(`[EmailPoll] UID ${uid} contactHint=${contactHint}, fromAddr=${fromAddr}`)

          const processResult = await processIngestion({
            source: 'email',
            content: parsed.body || textContent,
            contactHint,
            metadata: {
              originalFrom: fromAddr || undefined,
              originalTo: parsed.to || (env?.to?.[0]?.address) || undefined,
              subject: parsed.subject || env?.subject || undefined,
              signature: parsed.signature || undefined,
            },
          })

          if (processResult.duplicate) {
            result.skipped++
            result.items.push({
              subject: env?.subject || '(no subject)',
              from: fromAddr || 'unknown',
              result: 'skipped — duplicate',
            })
          } else {
            result.processed++
            result.items.push({
              subject: env?.subject || '(no subject)',
              from: fromAddr || 'unknown',
              result: `ingested → ${processResult.itemType} (${processResult.contactName || 'unknown contact'})`,
            })
          }

          // Mark as seen
          await client.messageFlagsAdd({ uid }, ['\\Seen'], { uid: true })
        } catch (err) {
          result.errors++
          console.error('[EmailPoll] Error processing message UID', uid, ':', err)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const env = envelope as any
          result.items.push({
            subject: env?.subject || '(unknown)',
            from: env?.from?.[0]?.address || 'unknown',
            result: `error: ${err instanceof Error ? err.message : String(err)}`,
          })
        }
      }
    } finally {
      lock.release()
    }

    console.log(`[EmailPoll] Done: ${result.processed} processed, ${result.skipped} skipped, ${result.errors} errors`)
  } catch (err) {
    console.error('[EmailPoll] Connection error:', err)
    throw err
  } finally {
    try {
      await client.logout()
    } catch {
      // Already disconnected, ignore
      try { client.close(); } catch { /* noop */ }
    }
  }

  return result
}
