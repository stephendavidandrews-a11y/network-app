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
import type { IngestRequest, IngestionSource, AudioFeatures } from '@/types'
import OpenAI from 'openai'
import { writeFile, unlink } from 'fs/promises'
import { createReadStream } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'
import os from 'os'

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

/**
 * Detect audio format from magic bytes.
 */
function detectAudioFormat(buffer: Buffer): string {
  // Check magic bytes
  if (buffer.length >= 4) {
    // MP4/M4A: starts with ftyp at offset 4
    if (buffer.length >= 8 && buffer.toString('ascii', 4, 8) === 'ftyp') return 'm4a'
    // WAV: RIFF header
    if (buffer.toString('ascii', 0, 4) === 'RIFF') return 'wav'
    // OGG: OggS header
    if (buffer.toString('ascii', 0, 4) === 'OggS') return 'ogg'
    // FLAC: fLaC header
    if (buffer.toString('ascii', 0, 4) === 'fLaC') return 'flac'
    // MP3: ID3 tag or sync word
    if (buffer.toString('ascii', 0, 3) === 'ID3') return 'mp3'
    if (buffer[0] === 0xFF && (buffer[1] & 0xE0) === 0xE0) return 'mp3'
    // WebM: starts with 0x1A45DFA3 (EBML header)
    if (buffer[0] === 0x1A && buffer[1] === 0x45 && buffer[2] === 0xDF && buffer[3] === 0xA3) return 'webm'
  }
  // Default to m4a (most common from iOS Voice Memos)
  return 'm4a'
}

/**
 * Try to call the Python audio analysis service (librosa).
 * Returns AudioFeatures if available, undefined if service is down.
 */
async function tryAudioAnalysis(filePath: string): Promise<AudioFeatures | undefined> {
  const audioServiceUrl = process.env.AUDIO_ANALYSIS_URL || 'http://localhost:5050'

  try {
    // Read the file and send it to the analysis service
    const { readFile } = await import('fs/promises')
    const fileBuffer = await readFile(filePath)
    const formData = new FormData()
    const blob = new Blob([fileBuffer])
    formData.append('file', blob, 'audio.' + filePath.split('.').pop())

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 30000) // 30s timeout

    const res = await fetch(`${audioServiceUrl}/analyze`, {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    })

    clearTimeout(timeout)

    if (!res.ok) {
      console.log(`[Ingestion] Audio analysis returned ${res.status}`)
      return undefined
    }

    const data = await res.json()
    return data as AudioFeatures
  } catch (err) {
    // Service not available — that's fine, audio features are optional
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('ECONNREFUSED') || msg.includes('abort')) {
      console.log('[Ingestion] Audio analysis service not running — skipping')
    } else {
      console.log(`[Ingestion] Audio analysis error: ${msg}`)
    }
    return undefined
  }
}

export async function POST(request: NextRequest) {
  try {
    // ── API Key Auth (for iOS Shortcuts / external integrations) ──
    // If an X-API-Key header is present, validate it.
    // Web app requests don't send this header (they're behind Caddy basic auth).
    // iOS Shortcuts and external tools bypass Caddy and must provide a valid key.
    const apiKey = request.headers.get('x-api-key')
    const expectedKey = process.env.INGEST_API_KEY

    if (apiKey && expectedKey && apiKey !== expectedKey) {
      return NextResponse.json(
        { error: 'Invalid API key' },
        { status: 401 }
      )
    }

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

    // ── Audio Transcription via Whisper ──
    let processedContent = content || ''
    let audioFeatures: AudioFeatures | undefined

    if (body.audioBase64 && !content) {
      if (!process.env.OPENAI_API_KEY) {
        return NextResponse.json(
          { error: 'OPENAI_API_KEY not configured — cannot transcribe audio' },
          { status: 500 }
        )
      }

      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
      let tempPath: string | null = null

      try {
        // Decode base64 audio
        const audioBuffer = Buffer.from(body.audioBase64, 'base64')

        // Check size (25MB Whisper limit)
        if (audioBuffer.length > 25 * 1024 * 1024) {
          return NextResponse.json(
            { error: 'Audio file exceeds 25MB limit' },
            { status: 400 }
          )
        }

        // Detect format from first bytes (magic bytes)
        const ext = detectAudioFormat(audioBuffer)
        const tempId = randomUUID()
        tempPath = join(os.tmpdir(), `ingest-${tempId}.${ext}`)
        await writeFile(tempPath, audioBuffer)

        console.log(`[Ingestion] Transcribing audio: ${(audioBuffer.length / 1024 / 1024).toFixed(1)}MB, format=${ext}`)

        // Call Whisper API
        const transcription = await openai.audio.transcriptions.create({
          file: createReadStream(tempPath),
          model: 'whisper-1',
          language: 'en',
          response_format: 'text',
        })

        processedContent = typeof transcription === 'string'
          ? transcription
          : String(transcription)

        if (!processedContent.trim()) {
          return NextResponse.json(
            { error: 'Whisper returned empty transcript — audio may be silent or corrupted' },
            { status: 400 }
          )
        }

        console.log(`[Ingestion] Transcription complete: ${processedContent.length} chars`)

        // Try audio analysis service (librosa) if available
        audioFeatures = await tryAudioAnalysis(tempPath).catch(err => {
          console.log(`[Ingestion] Audio analysis unavailable: ${err.message}`)
          return undefined
        })
      } catch (err) {
        console.error('[Ingestion] Audio transcription failed:', err)
        const errMsg = err instanceof Error ? err.message : String(err)
        return NextResponse.json(
          { error: `Audio transcription failed: ${errMsg}` },
          { status: 500 }
        )
      } finally {
        if (tempPath) {
          try { await unlink(tempPath) } catch { /* ignore cleanup errors */ }
        }
      }
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
      audioFeatures,
    })

    // Attach audio features to extraction if available
    if (audioFeatures) {
      extraction.audioFeatures = audioFeatures
    }

    // ── Write to Queue ──
    const item = await prisma.ingestionItem.create({
      data: {
        source,
        itemType: extraction.itemType,
        rawContent: processedContent,
        transcript: body.audioBase64 ? processedContent : null,
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
