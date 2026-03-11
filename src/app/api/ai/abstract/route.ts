import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { budgetedCreate, truncateForAPI } from '@/lib/api-budget'
export async function POST(request: NextRequest) {
  const body = await request.json()
  const { eventId, topics, eventName, eventType } = body

  if (!eventId && !eventName) {
    return NextResponse.json({ error: 'eventId or eventName is required' }, { status: 400 })
  }

  // Fetch expertise profile
  const expertiseSetting = await prisma.appSetting.findUnique({
    where: { key: 'expertise_profile' },
  })
  let expertise: Record<string, unknown> = {}
  try { expertise = JSON.parse(expertiseSetting?.value || '{}') } catch { /* ignore */ }

  const topicList = topics || []
  const eventInfo = eventName || 'Conference'

  try {
    const message = await budgetedCreate({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: `Generate a conference abstract/proposal for Stephen Andrews to submit to "${eventInfo}"${eventType ? ` (${eventType})` : ''}.

SPEAKER PROFILE:
${expertise.bio_short || 'Government attorney at the CFTC focused on commodity and crypto regulation.'}
Primary expertise: ${Array.isArray(expertise.primary) ? expertise.primary.join(', ') : 'Administrative law, commodity regulation, crypto policy'}
Secondary expertise: ${Array.isArray(expertise.secondary) ? expertise.secondary.join(', ') : 'Prediction markets, DeFi governance'}

EVENT TOPICS: ${topicList.length > 0 ? topicList.join(', ') : 'General regulatory policy'}

Write a compelling 200-250 word abstract that:
1. Has a specific, engaging title
2. Opens with a hook that highlights a current tension or question in the field
3. Outlines 3-4 key points the presentation will cover
4. Closes with what attendees will take away
5. Positions Stephen as a practitioner with insider perspective, not just an academic

Return in this format:
TITLE: [talk title]
---
[abstract text]`,
      }],
    }, 'ai-abstract')

    const responseText = message.content
      .filter(block => block.type === 'text')
      .map(block => (block as { type: 'text'; text: string }).text)
      .join('')

    let title = ''
    let abstractText = responseText

    const titleMatch = responseText.match(/^TITLE:\s*([^\n]+)\n(?:---\n)?/)
    if (titleMatch) {
      title = titleMatch[1].trim()
      abstractText = responseText.slice(titleMatch[0].length).trim()
    }

    // Save to event if eventId provided
    if (eventId) {
      await prisma.event.update({
        where: { id: eventId },
        data: { abstractDraft: `${title}\n\n${abstractText}` },
      })
    }

    return NextResponse.json({ title, abstract: abstractText })
  } catch (error) {
    console.error('Abstract generation failed:', error)
    return NextResponse.json(
      { error: 'Failed to generate abstract. Check ANTHROPIC_API_KEY.' },
      { status: 500 }
    )
  }
}
