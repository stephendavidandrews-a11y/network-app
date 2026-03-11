import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import type { DebriefExtraction, DebriefCommitment, DebriefCalendarEvent } from '@/types'
import { budgetedCreate, truncateForAPI } from '@/lib/api-budget'
export async function POST(request: NextRequest) {
  const body = await request.json()
  const { transcript, contactId, meetingContext } = body

  if (!transcript) {
    return NextResponse.json({ error: 'transcript is required' }, { status: 400 })
  }

  if (!contactId) {
    return NextResponse.json({ error: 'contactId is required' }, { status: 400 })
  }

  // ── Build Rich Context Package ──

  const contact = await prisma.contact.findUnique({
    where: { id: contactId },
    include: {
      interactions: { orderBy: { date: 'desc' }, take: 5 },
      signals: { orderBy: { detectedAt: 'desc' }, take: 5 },
    },
  })

  if (!contact) {
    return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
  }

  // Check if this is a personal/social contact
  const contactType = (contact as Record<string, unknown>).contactType as string || 'professional'
  const isPersonal = contactType === 'personal' || contactType === 'both'

  // Unfulfilled commitments from the Commitment table
  const existingCommitments = await prisma.commitment.findMany({
    where: { contactId, fulfilled: false },
    orderBy: { dueDate: 'asc' },
  })

  // Upcoming events (next 30 days) for temporal resolution
  const today = new Date()
  const todayStr = today.toISOString().split('T')[0]
  const thirtyDaysOut = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  const upcomingEvents = await prisma.event.findMany({
    where: {
      dateStart: { gte: todayStr, lte: thirtyDaysOut },
    },
    orderBy: { dateStart: 'asc' },
    take: 20,
  })

  // Today's calendar meetings (from cache)
  const calendarCache = await prisma.calendarCache.findUnique({
    where: { date: todayStr },
  })

  let todaysMeetings: Array<{ summary: string; start: string; end: string }> = []
  if (calendarCache) {
    try {
      const calData = JSON.parse(calendarCache.calendarData)
      todaysMeetings = (calData.meetings || []).map((m: { summary: string; start: string; end: string }) => ({
        summary: m.summary,
        start: m.start,
        end: m.end,
      }))
    } catch { /* skip */ }
  }

  // ── Build Day-of-Week Reference for Temporal Parsing ──

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const temporalReference: string[] = [
    `Today is ${dayNames[today.getDay()]}, ${todayStr}.`,
  ]

  // Add next 14 days with day names for "next Tuesday", "this Friday", etc.
  for (let i = 1; i <= 14; i++) {
    const d = new Date(Date.now() + i * 24 * 60 * 60 * 1000)
    const dayName = dayNames[d.getDay()]
    const dateStr = d.toISOString().split('T')[0]
    if (i <= 7) {
      temporalReference.push(`This ${dayName} = ${dateStr}`)
    } else {
      temporalReference.push(`Next ${dayName} = ${dateStr}`)
    }
  }

  // ── Assemble System Prompt ──

  const systemPrompt = `You are an executive assistant extracting structured information from a voice debrief recording transcript. Stephen Andrews, a senior government attorney at the CFTC, recorded this after a meeting with ${contact.name}.

CRITICAL: Extract information with high fidelity. For every commitment and follow-up, preserve the speaker's ORIGINAL WORDS from the transcript alongside your structured extraction.

## Temporal Resolution Rules
${temporalReference.join('\n')}

When the speaker says temporal phrases like "by Friday", "next week", "in two weeks", "before the conference", "after the holiday", resolve them to specific YYYY-MM-DD dates using the reference above and the upcoming events list below.

## Upcoming Events (for temporal context)
${upcomingEvents.length > 0
    ? upcomingEvents.map(e => `- ${e.dateStart}: ${e.name}${e.location ? ` (${e.location})` : ''}`).join('\n')
    : '- No upcoming events'}

## Extraction Schema

Return ONLY valid JSON in this exact format:
{
  "summary": "2-3 sentence summary of the key discussion points",
  "myCommitments": [
    {
      "description": "What Stephen committed to do, cleaned up",
      "originalWords": "The exact words from the transcript where Stephen made this commitment",
      "resolvedDate": "YYYY-MM-DD or null if no date mentioned or inferrable",
      "resolvedTime": "HH:MM in 24h format or null if no specific time mentioned",
      "confidence": "high|medium|low — how confident you are this is a real commitment"
    }
  ],
  "contactCommitments": [
    {
      "description": "What ${contact.name} committed to do for Stephen",
      "originalWords": "The exact words from the transcript",
      "resolvedDate": "YYYY-MM-DD or null",
      "resolvedTime": "HH:MM or null",
      "confidence": "high|medium|low"
    }
  ],
  "calendarEvents": [
    {
      "title": "Event name (e.g. 'Church', 'Bible Study with Josh Hawley')",
      "originalWords": "The exact words from the transcript describing this event",
      "date": "YYYY-MM-DD",
      "startTime": "HH:MM in 24h format (e.g. '10:30' for 10:30 AM, '18:30' for 6:30 PM)",
      "endTime": "HH:MM or null (estimate +1 hour from start if not mentioned)",
      "location": "Location if mentioned, or null",
      "attendees": ["Names of people mentioned as attending"]
    }
  ],
  "newContactsMentioned": [{"name": "string", "org": "string or null", "context": "why they came up"}],
  "followUps": [{"description": "Action item (not a formal commitment)", "originalWords": "exact words from transcript"}],
  "relationshipNotes": "Observations about relationship quality, changes in contact's situation, strategic insights",
  "topicsDiscussed": ["keyword1", "keyword2"],
  "personalInterests": ["interest1", "interest2"],
  "personalActivities": ["activity1", "activity2"],
  "lifeEventsMentioned": [{"eventType": "birthday|anniversary|move|job_change|milestone|custom", "description": "string", "date": "YYYY-MM-DD or null"}]
}

## Event vs Commitment vs Follow-Up Distinction
- CALENDAR EVENT: Something scheduled at a specific date/time that Stephen plans to attend. "Church at 10:30", "dinner at 7pm", "bible study at 6:30", "conference on March 15th". These go in calendarEvents.
- COMMITMENT: A specific promise with implied accountability. "I'll send you that memo" = myCommitment. "${contact.name} said they'd introduce me to their colleague" = contactCommitment. These are action items, NOT scheduled events.
- FOLLOW-UP: A looser action item. "I should look into that regulation" = follow-up. "Interesting idea to explore" = follow-up.

IMPORTANT: When the speaker mentions multiple events/commitments, extract EACH ONE as a separate entry. Do not merge them.

## Confidence Levels
- HIGH: Explicit statement like "I will", "I'll", "I promise to", "Let me send you"
- MEDIUM: Implied agreement or "I should probably", "that would be good to do"
- LOW: Vague intent, "maybe I could", "we should think about"

## Time Parsing
- "10:30 AM" or "10:30 in the morning" → "10:30"
- "6:30 PM" or "6:30 in the evening" → "18:30"
- "noon" → "12:00"
- "midnight" → "00:00"
- If only a time is mentioned without a date, assume today (${todayStr})

If a field has no relevant content, use an empty array [] or empty string "".
Do NOT include any text outside the JSON object.

${isPersonal ? `## Personal/Social Context
This contact is a PERSONAL friend (not just professional). Pay special attention to:
- Personal interests they mention (hobbies, sports, music, food preferences, etc.) → personalInterests
- Activities they do or want to do (hiking, book club, gym, cooking, etc.) → personalActivities
- Life events mentioned (birthdays, moves, job changes, health news, milestones) → lifeEventsMentioned
- Even if the conversation is casual, extract these personal data points. They help maintain the friendship.` : ''}`

  // ── Assemble User Prompt with Rich Context ──

  const recentHistory = contact.interactions.length > 0
    ? contact.interactions.map(i => `- ${i.date}: ${i.type} — ${i.summary || 'No summary'}`).join('\n')
    : 'No previous interactions'

  const existingCommitmentsList = existingCommitments.length > 0
    ? existingCommitments.map(c =>
        `- ${c.description}${c.dueDate ? ` (due: ${c.dueDate})` : ''}`
      ).join('\n')
    : 'None'

  const recentSignals = contact.signals.length > 0
    ? contact.signals.map(s => `- ${s.detectedAt}: [${s.signalType}] ${s.title}`).join('\n')
    : 'None'

  const userPrompt = `## CONTACT PROFILE
Name: ${contact.name}
Title: ${contact.title || 'Unknown'}
Organization: ${contact.organization || 'Unknown'}
Tier: ${contact.tier} (${contact.tier === 1 ? 'highest priority' : contact.tier === 2 ? 'medium priority' : 'lower priority'})
Why they matter: ${contact.whyTheyMatter || 'N/A'}
Notes: ${contact.notes || 'None'}
Relationship Strength: ${contact.relationshipStrength}/10
${meetingContext ? `\n## MEETING CONTEXT\n${meetingContext}` : ''}

## RECENT INTERACTION HISTORY
${recentHistory}

## EXISTING UNFULFILLED COMMITMENTS (for deduplication — do not re-extract these unless the transcript updates them)
${existingCommitmentsList}

## RECENT INTELLIGENCE SIGNALS
${recentSignals}

## TODAY'S CALENDAR
${todaysMeetings.length > 0
    ? todaysMeetings.map(m => `- ${m.start}: ${m.summary}`).join('\n')
    : 'No meetings cached'}

## TRANSCRIPT
${transcript}

Extract the structured information now. Remember to resolve any temporal references ("by Friday", "next week", "before the conference") to specific dates.`

  try {
    const message = await budgetedCreate({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 3000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }, 'ai-debrief')

    const responseText = message.content
      .filter(block => block.type === 'text')
      .map(block => (block as { type: 'text'; text: string }).text)
      .join('')

    let raw: Record<string, unknown>

    try {
      raw = JSON.parse(responseText)
    } catch {
      // Fallback: try to extract JSON from markdown code block
      const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/)
      if (jsonMatch) {
        raw = JSON.parse(jsonMatch[1])
      } else {
        console.error('[Debrief] Failed to parse response:', responseText)
        return NextResponse.json(
          { error: 'Failed to parse extraction response' },
          { status: 500 }
        )
      }
    }

    // ── Validate and normalize ──

    const normalizeCommitment = (c: Record<string, unknown>): DebriefCommitment => ({
      description: String(c.description || ''),
      originalWords: String(c.originalWords || ''),
      resolvedDate: (c.resolvedDate as string) || null,
      resolvedTime: (c.resolvedTime as string) || null,
      confidence: (['high', 'medium', 'low'].includes(c.confidence as string)
        ? c.confidence as 'high' | 'medium' | 'low'
        : 'medium'),
      dueDate: (c.resolvedDate as string) || (c.dueDate as string) || null,
    })

    const myCommitments = Array.isArray(raw.myCommitments)
      ? (raw.myCommitments as Record<string, unknown>[]).map(normalizeCommitment)
      : []

    const contactCommitments = Array.isArray(raw.contactCommitments)
      ? (raw.contactCommitments as Record<string, unknown>[]).map(normalizeCommitment)
      : []

    const followUps = Array.isArray(raw.followUps)
      ? (raw.followUps as Array<Record<string, unknown>>).map(f => ({
          description: String(f.description || ''),
          originalWords: String(f.originalWords || ''),
        }))
      : []

    const calendarEvents: DebriefCalendarEvent[] = Array.isArray(raw.calendarEvents)
      ? (raw.calendarEvents as Array<Record<string, unknown>>).map(e => ({
          title: String(e.title || ''),
          originalWords: String(e.originalWords || ''),
          date: (e.date as string) || null,
          startTime: (e.startTime as string) || null,
          endTime: (e.endTime as string) || null,
          location: (e.location as string) || null,
          attendees: Array.isArray(e.attendees) ? (e.attendees as string[]).map(String) : [],
        }))
      : []

    const newContactsMentioned = Array.isArray(raw.newContactsMentioned)
      ? (raw.newContactsMentioned as Array<Record<string, unknown>>).map(nc => ({
          name: String(nc.name || ''),
          org: (nc.org as string) || null,
          context: String(nc.context || ''),
        }))
      : []

    // Build legacy commitments array for backward compatibility
    const legacyCommitments = myCommitments.map(c => ({
      description: c.description,
      dueDate: c.dueDate,
    }))

    const extraction: DebriefExtraction = {
      summary: String(raw.summary || ''),
      myCommitments,
      contactCommitments,
      calendarEvents,
      newContactsMentioned,
      followUps,
      relationshipNotes: String(raw.relationshipNotes || ''),
      topicsDiscussed: Array.isArray(raw.topicsDiscussed)
        ? (raw.topicsDiscussed as string[]).map(String)
        : [],
      commitments: legacyCommitments,
      // Personal mode fields
      ...(isPersonal && {
        personalInterests: Array.isArray(raw.personalInterests)
          ? (raw.personalInterests as string[]).map(String)
          : [],
        personalActivities: Array.isArray(raw.personalActivities)
          ? (raw.personalActivities as string[]).map(String)
          : [],
        lifeEventsMentioned: Array.isArray(raw.lifeEventsMentioned)
          ? (raw.lifeEventsMentioned as Array<Record<string, unknown>>).map(le => ({
              eventType: String(le.eventType || 'custom'),
              description: String(le.description || ''),
              date: (le.date as string) || null,
            }))
          : [],
      }),
    }

    return NextResponse.json({ extraction })
  } catch (error) {
    console.error('[Debrief] Extraction failed:', error)
    return NextResponse.json(
      { error: 'Debrief extraction failed. Check ANTHROPIC_API_KEY.' },
      { status: 500 }
    )
  }
}
