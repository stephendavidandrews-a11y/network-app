import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import Anthropic from '@anthropic-ai/sdk'
import { DebriefExtraction } from '@/types'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
})

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { transcript, contactId, meetingContext } = body

  if (!transcript) {
    return NextResponse.json({ error: 'transcript is required' }, { status: 400 })
  }

  if (!contactId) {
    return NextResponse.json({ error: 'contactId is required' }, { status: 400 })
  }

  // Fetch contact for context
  const contact = await prisma.contact.findUnique({
    where: { id: contactId },
    include: {
      interactions: { orderBy: { date: 'desc' }, take: 3 },
    },
  })

  if (!contact) {
    return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
  }

  const systemPrompt = `You are an executive assistant extracting structured information from a voice debrief recording transcript. Stephen Andrews, a senior government attorney at the CFTC, recorded this after a meeting.

Extract the following from the transcript:

1. SUMMARY: A 2-3 sentence summary of the key discussion points
2. COMMITMENTS: Any promises Stephen made OR that were made to Stephen. Include description and suggested due date if mentioned or inferrable.
3. NEW CONTACTS MENTIONED: Any people mentioned by name who Stephen should add to his network. Include their name, organization if mentioned, and context for why they came up.
4. FOLLOW-UPS: Action items that need to happen but aren't formal commitments (e.g., "look into X", "share article about Y")
5. RELATIONSHIP NOTES: Any observations about the relationship quality, changes in the contact's situation, or strategic insights
6. TOPICS DISCUSSED: Key topic keywords for categorization

Return ONLY valid JSON in this exact format:
{
  "summary": "string",
  "commitments": [{"description": "string", "dueDate": "YYYY-MM-DD or null"}],
  "newContactsMentioned": [{"name": "string", "org": "string or null", "context": "string"}],
  "followUps": [{"description": "string"}],
  "relationshipNotes": "string",
  "topicsDiscussed": ["string"]
}

If a field has no relevant content, use an empty array [] or empty string "".
Do NOT include any text outside the JSON object.`

  const recentHistory = contact.interactions.length > 0
    ? contact.interactions.map(i => `- ${i.date}: ${i.type} — ${i.summary || 'No summary'}`).join('\n')
    : 'No previous interactions'

  const userPrompt = `MEETING CONTEXT:
Contact: ${contact.name}${contact.title ? `, ${contact.title}` : ''}${contact.organization ? ` at ${contact.organization}` : ''}
${meetingContext ? `Meeting: ${meetingContext}` : ''}

RECENT INTERACTION HISTORY:
${recentHistory}

TRANSCRIPT:
${transcript}

Extract the structured information now.`

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    })

    const responseText = message.content
      .filter(block => block.type === 'text')
      .map(block => (block as { type: 'text'; text: string }).text)
      .join('')

    let extraction: DebriefExtraction

    try {
      extraction = JSON.parse(responseText)
    } catch {
      // Fallback: try to extract JSON from markdown code block
      const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/)
      if (jsonMatch) {
        extraction = JSON.parse(jsonMatch[1])
      } else {
        console.error('[Debrief] Failed to parse response:', responseText)
        return NextResponse.json(
          { error: 'Failed to parse extraction response' },
          { status: 500 }
        )
      }
    }

    // Validate and sanitize structure
    extraction = {
      summary: extraction.summary || '',
      commitments: Array.isArray(extraction.commitments) ? extraction.commitments : [],
      newContactsMentioned: Array.isArray(extraction.newContactsMentioned) ? extraction.newContactsMentioned : [],
      followUps: Array.isArray(extraction.followUps) ? extraction.followUps : [],
      relationshipNotes: extraction.relationshipNotes || '',
      topicsDiscussed: Array.isArray(extraction.topicsDiscussed) ? extraction.topicsDiscussed : [],
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
