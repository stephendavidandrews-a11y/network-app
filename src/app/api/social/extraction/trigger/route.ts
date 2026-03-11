import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import Anthropic from '@anthropic-ai/sdk'

function parseJson(value: string | null, fallback: unknown = null) {
  if (!value) return fallback
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

const FACTUAL_MODEL = 'claude-sonnet-4-20250514'
const INTERPRETIVE_MODEL = 'claude-opus-4-20250514'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { contactId, type } = body

    if (!contactId || !type || !['factual', 'interpretive'].includes(type)) {
      return NextResponse.json(
        { error: 'contactId and type (factual|interpretive) required' },
        { status: 400 }
      )
    }

    const contact = await prisma.contact.findUnique({
      where: { id: contactId },
    })
    if (!contact) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
    }

    // Get 1:1 messages
    const messages = await prisma.textMessage.findMany({
      where: {
        contactId,
        isGroupMessage: false,
        content: { not: '' },
      },
      orderBy: { timestamp: 'asc' },
      select: { direction: true, content: true, timestamp: true },
    })

    if (messages.length === 0) {
      return NextResponse.json({ error: 'No messages found for contact' }, { status: 400 })
    }

    // Format messages
    const formatted = messages.map(m => {
      const ts = m.timestamp.slice(0, 16)
      const prefix = m.direction === 'sent' ? 'S' : 'R'
      const content = m.content && m.content.length > 500 ? m.content.slice(0, 500) + '...' : m.content
      return `[${ts}] ${prefix}: ${content}`
    }).join('\n')

    // Truncate to most recent messages if too many
    const truncatedMessages = messages.length > 6000 ? messages.slice(-6000) : messages
    const truncatedFormatted = truncatedMessages.map(m => {
      const ts = m.timestamp.slice(0, 16)
      const prefix = m.direction === 'sent' ? 'S' : 'R'
      const content = m.content && m.content.length > 500 ? m.content.slice(0, 500) + '...' : m.content
      return `[${ts}] ${prefix}: ${content}`
    }).join('\n')

    const client = new Anthropic()

    if (type === 'factual') {
      const response = await client.messages.create({
        model: FACTUAL_MODEL,
        max_tokens: 4000,
        system: FACTUAL_SYSTEM_PROMPT,
        messages: [{
          role: 'user',
          content: `Contact: ${contact.name}\nRing: ${contact.personalRing || 'unknown'}\nContact type: ${contact.contactType}\nTotal messages: ${truncatedMessages.length}\n\n--- MESSAGE HISTORY ---\n${truncatedFormatted}`,
        }],
      })

      const raw = response.content[0].type === 'text' ? response.content[0].text : ''
      const result = parseJsonResponse(raw)

      if (!result) {
        return NextResponse.json({ error: 'Failed to parse extraction result' }, { status: 500 })
      }

      // Upsert profile
      const existing = await prisma.textExtractionProfile.findFirst({
        where: { contactId, extractionType: 'factual' },
      })

      const now = new Date().toISOString()
      const data = {
        interests: JSON.stringify(result.interests || []),
        activities: JSON.stringify(result.activities || []),
        lifeEvents: JSON.stringify(result.lifeEvents || []),
        locationSignals: JSON.stringify(result.locationSignals || {}),
        keyPeopleMentioned: JSON.stringify(result.keyPeopleMentioned || []),
        howWeMetSignal: result.howWeMetSignal || null,
        typicalTopics: JSON.stringify(result.typicalTopics || []),
        availabilityPatterns: result.availabilityPatterns || null,
        openThreads: JSON.stringify(result.openThreads || []),
        lastExtracted: now,
      }

      if (existing) {
        await prisma.textExtractionProfile.update({
          where: { id: existing.id },
          data,
        })
      } else {
        await prisma.textExtractionProfile.create({
          data: { contactId, extractionType: 'factual', ...data },
        })
      }

      return NextResponse.json({ success: true, type: 'factual', result })
    } else {
      // Interpretive — needs factual profile first
      const factualProfile = await prisma.textExtractionProfile.findFirst({
        where: { contactId, extractionType: 'factual' },
      })

      const factualData = factualProfile ? {
        interests: parseJson(factualProfile.interests, []),
        activities: parseJson(factualProfile.activities, []),
        lifeEvents: parseJson(factualProfile.lifeEvents, []),
        locationSignals: parseJson(factualProfile.locationSignals, {}),
        typicalTopics: parseJson(factualProfile.typicalTopics, []),
      } : {}

      const systemPrompt = INTERPRETIVE_SYSTEM_PROMPT
        .replace('{contact_name}', contact.name)
        .replace('{factual_json}', JSON.stringify(factualData, null, 2))

      const response = await client.messages.create({
        model: INTERPRETIVE_MODEL,
        max_tokens: 4000,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: `Contact: ${contact.name}\nRing: ${contact.personalRing || 'unknown'}\nContact type: ${contact.contactType}\nTotal messages: ${truncatedMessages.length}\n\n--- MESSAGE HISTORY ---\n${truncatedFormatted}`,
        }],
      })

      const raw = response.content[0].type === 'text' ? response.content[0].text : ''
      const result = parseJsonResponse(raw)

      if (!result) {
        return NextResponse.json({ error: 'Failed to parse extraction result' }, { status: 500 })
      }

      const existing = await prisma.textExtractionProfile.findFirst({
        where: { contactId, extractionType: 'interpretive' },
      })

      const now = new Date().toISOString()
      const data = {
        communicationStyle: result.communicationStyle || null,
        personalityRead: result.personalityRead ? JSON.stringify(result.personalityRead) : null,
        emotionalAvailability: result.emotionalAvailability || null,
        humorStyle: result.humorStyle || null,
        reliabilitySignal: result.reliabilitySignal || null,
        whatTheyCareAbout: result.whatTheyCareAbout || null,
        howTheySeeYou: result.howTheySeeYou || null,
        relationshipArc: result.relationshipArc || null,
        warmthSignal: result.warmthSignal || null,
        initiationPattern: result.initiationPattern || null,
        workingStyle: result.workingStyle || null,
        strategicPriorities: result.strategicPriorities || null,
        whatTheyWantFromYou: result.whatTheyWantFromYou || null,
        summary: result.summary || null,
        preOutreachBrief: result.preOutreachBrief || null,
        lastExtracted: now,
      }

      if (existing) {
        await prisma.textExtractionProfile.update({
          where: { id: existing.id },
          data,
        })
      } else {
        await prisma.textExtractionProfile.create({
          data: { contactId, extractionType: 'interpretive', ...data },
        })
      }

      return NextResponse.json({ success: true, type: 'interpretive', result })
    }
  } catch (error) {
    console.error('[Extraction Trigger] Error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

function parseJsonResponse(text: string): Record<string, unknown> | null {
  text = text.trim()
  try {
    return JSON.parse(text)
  } catch {
    // Try extracting from code block
    if (text.includes('```')) {
      const parts = text.split('```')
      for (let i = 1; i < parts.length; i += 2) {
        let candidate = parts[i].trim()
        if (candidate.startsWith('json')) candidate = candidate.slice(4).trim()
        try {
          return JSON.parse(candidate)
        } catch {
          continue
        }
      }
    }
    return null
  }
}

const FACTUAL_SYSTEM_PROMPT = `You are analyzing a text message conversation to extract factual, evidence-based information about the contact. The user is Stephen Andrews, a senior government attorney at the CFTC based in Washington, DC.

Messages are labeled:
S: = sent by Stephen
R: = received by the contact

Extract ONLY what is directly evidenced in the messages. If there isn't enough signal, omit the field rather than guessing.

Confidence levels:
- high: explicitly stated
- medium: strongly implied
- low: loosely suggested

Pay special attention to "open threads" — plans mentioned but never executed, life events acknowledged but never followed up on. Extract up to 5 most recent/relevant.

Output ONLY valid JSON:
{
  "interests": [{"interest": "string", "confidence": "high|medium|low", "evidence": "brief context"}],
  "activities": [{"activity": "string", "frequency": "daily|weekly|monthly|occasional|one_time", "confidence": "high|medium|low"}],
  "lifeEvents": [{"description": "string", "date": "YYYY-MM-DD or null", "eventType": "birthday|move|job_change|engagement|wedding|child_birth|graduation|health|loss|milestone|custom"}],
  "locationSignals": {
    "city": {"value": "string or null", "confidence": "high|medium|low"},
    "stateRegion": {"value": "string or null", "confidence": "high|medium|low"},
    "neighborhood": {"value": "string or null", "confidence": "high|medium|low"},
    "workLocation": {"value": "string or null", "confidence": "high|medium|low"}
  },
  "keyPeopleMentioned": [{"name": "string", "relationship": "partner|sibling|parent|child|friend|coworker|boss", "context": "string"}],
  "howWeMetSignal": "string or null",
  "typicalTopics": ["string"],
  "availabilityPatterns": "string or null",
  "openThreads": [{"description": "string", "type": "unmade_plan|unfollowed_promise|open_question|dropped_topic", "lastMentioned": "YYYY-MM-DD", "initiatedBy": "stephen|them"}]
}`

const INTERPRETIVE_SYSTEM_PROMPT = `You are a relationship intelligence analyst reviewing the text message history between Stephen Andrews and {contact_name}. Stephen is a senior government attorney at the CFTC based in Washington, DC.

Factual Profile (for context):
{factual_json}

Ground every assessment in patterns across multiple messages. Be honest about confidence.

Messages are labeled:
S: = sent by Stephen
R: = received by the contact

Output ONLY valid JSON:
{
  "communicationStyle": "string",
  "personalityRead": {"description": "string", "confidence": "high|medium|low", "traits": ["string"]},
  "emotionalAvailability": "string",
  "humorStyle": "string",
  "reliabilitySignal": "string",
  "whatTheyCareAbout": "string",
  "howTheySeeYou": "string",
  "relationshipArc": "deepening|stable|cooling",
  "warmthSignal": "low|medium|high",
  "initiationPattern": "mostly_stephen|mostly_them|balanced",
  "workingStyle": "string or null",
  "strategicPriorities": "string or null",
  "whatTheyWantFromYou": "string or null",
  "summary": "string — 3-5 sentence relationship summary",
  "preOutreachBrief": "string — 2-3 sentence briefing before reaching out"
}`
