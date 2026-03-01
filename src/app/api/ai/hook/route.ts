import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
})

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { signalType, signalTitle, signalDescription, contactName, contactOrg, contactContext } = body

  if (!signalTitle || !contactName) {
    return NextResponse.json({ error: 'signalTitle and contactName are required' }, { status: 400 })
  }

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 256,
      messages: [{
        role: 'user',
        content: `Generate a concise outreach hook (1-2 sentences) that Stephen Andrews could use to reach out to ${contactName}${contactOrg ? ` at ${contactOrg}` : ''} based on this intelligence signal:

Signal type: ${signalType || 'general'}
Title: ${signalTitle}
Description: ${signalDescription || 'N/A'}
${contactContext ? `Context about contact: ${contactContext}` : ''}

The hook should reference the signal naturally and create a reason for outreach. Be specific, not generic. Return ONLY the hook text, nothing else.`,
      }],
    })

    const hook = message.content
      .filter(block => block.type === 'text')
      .map(block => (block as { type: 'text'; text: string }).text)
      .join('')
      .trim()

    return NextResponse.json({ hook })
  } catch (error) {
    console.error('Hook generation failed:', error)
    return NextResponse.json(
      { error: 'Failed to generate hook. Check ANTHROPIC_API_KEY.' },
      { status: 500 }
    )
  }
}
