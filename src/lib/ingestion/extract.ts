/**
 * Ingestion Extraction Pipeline
 *
 * Takes raw content (email, text, voice transcript) and produces
 * a full IngestionExtraction via Claude. This is the core intelligence
 * extraction engine for the ingestion system.
 */

import Anthropic from '@anthropic-ai/sdk'
import type { IngestionExtraction, IngestionSource } from '@/types'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
})

interface ExtractionContext {
  source: IngestionSource
  contactName?: string
  contactOrg?: string
  contactTier?: number
  contactNotes?: string
  contactWhyTheyMatter?: string
  recentInteractions?: Array<{ date: string; type: string; summary: string | null }>
  existingCommitments?: Array<{ description: string; dueDate: string | null }>
  metadata?: {
    originalFrom?: string
    originalTo?: string
    subject?: string
    forwardedFrom?: string
    signature?: {
      name?: string
      title?: string
      org?: string
      phone?: string
      email?: string
    }
  }
}

function buildTemporalReference(): string[] {
  const today = new Date()
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const todayStr = today.toISOString().split('T')[0]
  const lines: string[] = [
    `Today is ${dayNames[today.getDay()]}, ${todayStr}.`,
  ]

  for (let i = 1; i <= 14; i++) {
    const d = new Date(Date.now() + i * 24 * 60 * 60 * 1000)
    const dayName = dayNames[d.getDay()]
    const dateStr = d.toISOString().split('T')[0]
    if (i <= 7) {
      lines.push(`This ${dayName} = ${dateStr}`)
    } else {
      lines.push(`Next ${dayName} = ${dateStr}`)
    }
  }
  return lines
}

function sourceLabel(source: IngestionSource): string {
  switch (source) {
    case 'email': return 'forwarded email'
    case 'imessage_auto': return 'iMessage text exchange'
    case 'ios_shortcut': return 'iOS-captured note'
    case 'voice': return 'voice note transcript'
    case 'signal_forward': return 'forwarded intelligence signal'
    case 'manual': return 'manually entered note'
    default: return 'captured content'
  }
}

export async function extractFromContent(
  content: string,
  context: ExtractionContext
): Promise<IngestionExtraction> {
  const temporalRef = buildTemporalReference()

  const systemPrompt = `You are an elite relationship intelligence system. You extract comprehensive structured data from ${sourceLabel(context.source)} content captured by Stephen Andrews, a senior government attorney at the CFTC who is building a strategic networking intelligence platform.

Your extraction must be THOROUGH and ACCURATE. You capture not just what happened, but what it means — relationship dynamics, motivations, standing offers, unmet needs, and connections between people.

## Classification Rules
Classify the item as ONE of:
- "interaction" — A substantive exchange between Stephen and another person (meeting recap, email conversation, text thread, debrief)
- "intelligence_signal" — Information ABOUT a contact or organization (news, job change, org intel, article about someone) where Stephen is not a direct participant
- "scheduling" — Content that is purely about scheduling logistics with no substantive discussion
- "irrelevant" — Content that has no networking value (spam, automated notifications, personal non-networking)

## Temporal Resolution
${temporalRef.join('\n')}

Resolve temporal phrases ("by Friday", "next week", "in April") to specific YYYY-MM-DD dates.

## Extraction Schema

Return ONLY valid JSON matching this exact schema:

{
  "itemType": "interaction|intelligence_signal|scheduling|irrelevant",
  "summary": "Detailed, substantive summary. Not bullet points — reads like a debrief you'd write for yourself. Captures what was discussed, how it went, the dynamic, and anything notable. 3-6 sentences for interactions, 1-3 for signals/scheduling.",
  "topicsDiscussed": ["specific topics, not generic categories — 'sufficient nexus test in commodity jurisdiction' not 'crypto regulation'"],

  "myCommitments": [
    {
      "description": "What Stephen committed to do",
      "originalWords": "Exact quote from source",
      "resolvedDate": "YYYY-MM-DD or null",
      "confidence": "high|medium|low"
    }
  ],
  "theirCommitments": [
    {
      "description": "What the other person committed to do for Stephen",
      "originalWords": "Exact quote",
      "resolvedDate": "YYYY-MM-DD or null",
      "confidence": "high|medium|low"
    }
  ],

  "asks": [
    {
      "description": "Request that isn't a firm commitment. 'Could you take a look at my draft?'",
      "direction": "from_me|from_them",
      "originalWords": "Exact quote"
    }
  ],
  "offers": [
    {
      "description": "Open-ended offer that persists as a leverage point. 'If you ever need an intro to Treasury, let me know.'",
      "offeredBy": "me|them",
      "originalWords": "Exact quote"
    }
  ],

  "newContactsMentioned": [
    {
      "name": "Full name",
      "org": "Organization or null",
      "title": "Title or null",
      "email": "Email or null",
      "phone": "Phone or null",
      "context": "How they came up — 'Jerry's new deputy at CFTC'",
      "connectionTo": "Which existing contact mentioned them, or null"
    }
  ],
  "existingContactsMentioned": ["Names of people already known who came up"],
  "observedConnections": [
    {
      "person1": "Name",
      "person2": "Name",
      "nature": "close colleagues, former roommates, met once at conference",
      "strength": "strong|moderate|weak|unknown",
      "source": "How this was revealed — 'Jerry mentioned during coffee'",
      "directional": false
    }
  ],

  "calendarEvents": [
    {
      "title": "Event name",
      "originalWords": "Exact quote",
      "date": "YYYY-MM-DD or null",
      "startTime": "HH:MM 24h or null",
      "endTime": "HH:MM 24h or null",
      "location": "Location or null",
      "attendees": ["Names"]
    }
  ],
  "schedulingLeads": [
    {
      "description": "Soft scheduling intent without firm date. 'Let's grab coffee soon.'",
      "originalWords": "Exact quote",
      "timeframe": "'next week', 'April', 'after recess', or null"
    }
  ],

  "orgIntelligence": [
    {
      "organization": "Org name",
      "intelligence": "What was learned — 'Hiring new policy director'",
      "source": "Who mentioned it"
    }
  ],
  "referencedResources": [
    {
      "description": "What it is — 'OCC guidance on crypto custody'",
      "type": "paper|article|podcast|document|book|other",
      "url": "URL or null",
      "action": "they_will_send|i_should_read|i_will_send|reference_only"
    }
  ],

  "lifeEvents": [
    {
      "description": "Personal milestone — 'Daughter starting at Georgetown this fall'",
      "person": "Who it's about",
      "date": "YYYY-MM-DD or null",
      "recurring": false
    }
  ],

  "relationshipNotes": "Personal details shared, rapport observations, anything revealing about who this person is beyond their professional role.",
  "sentiment": "warm|neutral|transactional|tense|enthusiastic",
  "relationshipDelta": "strengthened|maintained|weakened|new",

  "statusChanges": [
    {
      "person": "Name",
      "changeType": "job_change|promotion|departure|org_change|other",
      "from": "Previous role/org or null",
      "to": "New role/org or null",
      "description": "Brief description"
    }
  ]
}

## Important Rules
- Every commitment MUST include originalWords (exact quote from source)
- Standing offers are DIFFERENT from commitments — offers are open-ended, not time-bound
- Asks are DIFFERENT from commitments — asks are requests without firm accountability
- Calendar events are scheduled items; scheduling leads are soft intent ("let's meet soon")
- If the content is irrelevant, still return the full schema but with empty arrays and minimal summary
- Do NOT include any text outside the JSON object`

  const contactProfile = context.contactName
    ? `## CONTACT PROFILE
Name: ${context.contactName}
${context.contactOrg ? `Organization: ${context.contactOrg}` : ''}
${context.contactTier ? `Tier: ${context.contactTier} (${context.contactTier === 1 ? 'highest priority' : context.contactTier === 2 ? 'medium priority' : 'lower priority'})` : ''}
${context.contactWhyTheyMatter ? `Why they matter: ${context.contactWhyTheyMatter}` : ''}
${context.contactNotes ? `Notes: ${context.contactNotes}` : ''}`
    : '## CONTACT: Unknown — extract contact identity from the content if possible'

  const historySection = context.recentInteractions && context.recentInteractions.length > 0
    ? `## RECENT HISTORY
${context.recentInteractions.map(i => `- ${i.date}: ${i.type} — ${i.summary || 'No summary'}`).join('\n')}`
    : ''

  const commitmentsSection = context.existingCommitments && context.existingCommitments.length > 0
    ? `## EXISTING UNFULFILLED COMMITMENTS (do not re-extract unless updated)
${context.existingCommitments.map(c => `- ${c.description}${c.dueDate ? ` (due: ${c.dueDate})` : ''}`).join('\n')}`
    : ''

  const metadataSection = context.metadata
    ? `## EMAIL METADATA
${context.metadata.originalFrom ? `From: ${context.metadata.originalFrom}` : ''}
${context.metadata.originalTo ? `To: ${context.metadata.originalTo}` : ''}
${context.metadata.subject ? `Subject: ${context.metadata.subject}` : ''}
${context.metadata.forwardedFrom ? `Forwarded from: ${context.metadata.forwardedFrom}` : ''}
${context.metadata.signature ? `Signature: ${JSON.stringify(context.metadata.signature)}` : ''}`
    : ''

  const userPrompt = `${contactProfile}

${historySection}

${commitmentsSection}

${metadataSection}

## CONTENT (${sourceLabel(context.source)})
${content}

Extract the full structured data now. Be thorough — capture everything of value.`

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4000,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  })

  const responseText = message.content
    .filter(block => block.type === 'text')
    .map(block => (block as { type: 'text'; text: string }).text)
    .join('')

  let raw: Record<string, unknown>
  try {
    raw = JSON.parse(responseText)
  } catch {
    const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (jsonMatch) {
      raw = JSON.parse(jsonMatch[1])
    } else {
      console.error('[Ingestion] Failed to parse Claude response:', responseText.slice(0, 500))
      throw new Error('Failed to parse extraction response from Claude')
    }
  }

  return normalizeExtraction(raw)
}

function normalizeExtraction(raw: Record<string, unknown>): IngestionExtraction {
  const safeArray = <T>(val: unknown, mapper: (item: Record<string, unknown>) => T): T[] => {
    if (!Array.isArray(val)) return []
    return (val as Record<string, unknown>[]).map(mapper)
  }

  const safeString = (val: unknown, fallback = ''): string =>
    typeof val === 'string' ? val : fallback

  const validItemTypes = ['interaction', 'intelligence_signal', 'scheduling', 'irrelevant']
  const itemType = validItemTypes.includes(safeString(raw.itemType))
    ? safeString(raw.itemType) as IngestionExtraction['itemType']
    : 'interaction'

  const validSentiments = ['warm', 'neutral', 'transactional', 'tense', 'enthusiastic']
  const sentiment = validSentiments.includes(safeString(raw.sentiment))
    ? safeString(raw.sentiment) as IngestionExtraction['sentiment']
    : 'neutral'

  const validDeltas = ['strengthened', 'maintained', 'weakened', 'new']
  const relationshipDelta = validDeltas.includes(safeString(raw.relationshipDelta))
    ? safeString(raw.relationshipDelta) as IngestionExtraction['relationshipDelta']
    : 'maintained'

  const validConfidence = ['high', 'medium', 'low']
  const parseConfidence = (val: unknown): 'high' | 'medium' | 'low' =>
    validConfidence.includes(safeString(val)) ? safeString(val) as 'high' | 'medium' | 'low' : 'medium'

  return {
    itemType,
    summary: safeString(raw.summary),
    topicsDiscussed: Array.isArray(raw.topicsDiscussed)
      ? (raw.topicsDiscussed as unknown[]).map(t => String(t))
      : [],

    myCommitments: safeArray(raw.myCommitments, c => ({
      description: safeString(c.description),
      originalWords: safeString(c.originalWords),
      resolvedDate: safeString(c.resolvedDate) || null,
      confidence: parseConfidence(c.confidence),
    })),

    theirCommitments: safeArray(raw.theirCommitments, c => ({
      description: safeString(c.description),
      originalWords: safeString(c.originalWords),
      resolvedDate: safeString(c.resolvedDate) || null,
      confidence: parseConfidence(c.confidence),
    })),

    asks: safeArray(raw.asks, a => ({
      description: safeString(a.description),
      direction: safeString(a.direction) === 'from_me' ? 'from_me' as const : 'from_them' as const,
      originalWords: safeString(a.originalWords),
    })),

    offers: safeArray(raw.offers, o => ({
      description: safeString(o.description),
      offeredBy: safeString(o.offeredBy) === 'me' ? 'me' as const : 'them' as const,
      originalWords: safeString(o.originalWords),
    })),

    newContactsMentioned: safeArray(raw.newContactsMentioned, nc => ({
      name: safeString(nc.name),
      org: safeString(nc.org) || null,
      title: safeString(nc.title) || null,
      email: safeString(nc.email) || null,
      phone: safeString(nc.phone) || null,
      context: safeString(nc.context),
      connectionTo: safeString(nc.connectionTo) || null,
    })),

    existingContactsMentioned: Array.isArray(raw.existingContactsMentioned)
      ? (raw.existingContactsMentioned as unknown[]).map(n => String(n))
      : [],

    observedConnections: safeArray(raw.observedConnections, oc => ({
      person1: safeString(oc.person1),
      person2: safeString(oc.person2),
      nature: safeString(oc.nature),
      strength: (['strong', 'moderate', 'weak', 'unknown'].includes(safeString(oc.strength))
        ? safeString(oc.strength) as 'strong' | 'moderate' | 'weak' | 'unknown'
        : 'unknown'),
      source: safeString(oc.source),
      directional: oc.directional === true,
    })),

    calendarEvents: safeArray(raw.calendarEvents, e => ({
      title: safeString(e.title),
      originalWords: safeString(e.originalWords),
      date: safeString(e.date) || null,
      startTime: safeString(e.startTime) || null,
      endTime: safeString(e.endTime) || null,
      location: safeString(e.location) || null,
      attendees: Array.isArray(e.attendees) ? (e.attendees as unknown[]).map(a => String(a)) : [],
    })),

    schedulingLeads: safeArray(raw.schedulingLeads, s => ({
      description: safeString(s.description),
      originalWords: safeString(s.originalWords),
      timeframe: safeString(s.timeframe) || null,
    })),

    orgIntelligence: safeArray(raw.orgIntelligence, o => ({
      organization: safeString(o.organization),
      intelligence: safeString(o.intelligence),
      source: safeString(o.source),
    })),

    referencedResources: safeArray(raw.referencedResources, r => ({
      description: safeString(r.description),
      type: (['paper', 'article', 'podcast', 'document', 'book', 'other'].includes(safeString(r.type))
        ? safeString(r.type) as 'paper' | 'article' | 'podcast' | 'document' | 'book' | 'other'
        : 'other') as 'paper' | 'article' | 'podcast' | 'document' | 'book' | 'other',
      url: safeString(r.url) || null,
      action: (['they_will_send', 'i_should_read', 'i_will_send', 'reference_only'].includes(safeString(r.action))
        ? safeString(r.action) as 'they_will_send' | 'i_should_read' | 'i_will_send' | 'reference_only'
        : 'reference_only'),
    })),

    lifeEvents: safeArray(raw.lifeEvents, le => ({
      description: safeString(le.description),
      person: safeString(le.person),
      date: safeString(le.date) || null,
      recurring: le.recurring === true,
    })),

    relationshipNotes: safeString(raw.relationshipNotes),
    sentiment,
    relationshipDelta,

    statusChanges: safeArray(raw.statusChanges, sc => ({
      person: safeString(sc.person),
      changeType: (['job_change', 'promotion', 'departure', 'org_change', 'other'].includes(safeString(sc.changeType))
        ? safeString(sc.changeType) as 'job_change' | 'promotion' | 'departure' | 'org_change' | 'other'
        : 'other'),
      from: safeString(sc.from) || null,
      to: safeString(sc.to) || null,
      description: safeString(sc.description),
    })),
  }
}
