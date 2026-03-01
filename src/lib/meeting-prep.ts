import { PrismaClient } from '@prisma/client'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
})

export interface PrepContext {
  contact: {
    id: string
    name: string
    title: string | null
    organization: string | null
    tier: number
    whyTheyMatter: string | null
    connectionToHawleyOrbit: string | null
    notes: string | null
    categories: string
    tags: string
    relationshipStrength: number
    strategicValue: number
    targetCadenceDays: number
    lastInteractionDate: string | null
  }
  recentInteractions: Array<{
    date: string
    type: string
    summary: string | null
    commitments: string
  }>
  unfulfilledCommitments: Array<{
    description: string
    dueDate: string | null
    daysOverdue: number | null
    contactName: string
  }>
  recentSignals: Array<{
    signalType: string
    title: string
    description: string | null
    detectedAt: string
  }>
  sharedEvents: Array<{
    name: string
    dateStart: string | null
    role: string
  }>
  daysSinceLastInteraction: number | null
  meetingTitle: string | null
  meetingTime: string | null
}

export async function assembleContactContext(
  prisma: PrismaClient,
  contactId: string,
  meetingTitle?: string | null,
  meetingTime?: string | null
): Promise<PrepContext> {
  const contact = await prisma.contact.findUnique({
    where: { id: contactId },
    include: {
      interactions: { orderBy: { date: 'desc' }, take: 5 },
      signals: {
        where: {
          detectedAt: {
            gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
          },
        },
        orderBy: { detectedAt: 'desc' },
        take: 10,
      },
    },
  })

  if (!contact) throw new Error(`Contact not found: ${contactId}`)

  // Fetch unfulfilled commitments from dedicated Commitment table
  const today = new Date()
  const commitmentRows = await prisma.commitment.findMany({
    where: { contactId, fulfilled: false },
    orderBy: { dueDate: 'asc' },
  })

  const unfulfilledCommitments: PrepContext['unfulfilledCommitments'] = commitmentRows.map(c => {
    let daysOverdue: number | null = null
    if (c.dueDate) {
      daysOverdue = Math.floor(
        (today.getTime() - new Date(c.dueDate).getTime()) / (1000 * 60 * 60 * 24)
      )
      if (daysOverdue < 0) daysOverdue = null
    }
    return {
      description: c.description,
      dueDate: c.dueDate,
      daysOverdue,
      contactName: contact.name,
    }
  })

  // Find shared events (events where this contact is attending or speaking)
  const upcomingEvents = await prisma.event.findMany({
    where: {
      dateStart: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] },
    },
    orderBy: { dateStart: 'asc' },
    take: 20,
  })

  const sharedEvents: PrepContext['sharedEvents'] = []
  for (const event of upcomingEvents) {
    try {
      const attending = JSON.parse(event.contactsAttending || '[]')
      const speaking = JSON.parse(event.contactsSpeaking || '[]')
      if (attending.includes(contactId)) {
        sharedEvents.push({ name: event.name, dateStart: event.dateStart, role: 'attending' })
      } else if (speaking.includes(contactId)) {
        sharedEvents.push({ name: event.name, dateStart: event.dateStart, role: 'speaking' })
      }
    } catch { /* ignore */ }
  }

  // Calculate days since last interaction
  let daysSinceLastInteraction: number | null = null
  if (contact.lastInteractionDate) {
    const lastDate = new Date(contact.lastInteractionDate)
    daysSinceLastInteraction = Math.floor(
      (today.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24)
    )
  }

  return {
    contact: {
      id: contact.id,
      name: contact.name,
      title: contact.title,
      organization: contact.organization,
      tier: contact.tier,
      whyTheyMatter: contact.whyTheyMatter,
      connectionToHawleyOrbit: contact.connectionToHawleyOrbit,
      notes: contact.notes,
      categories: contact.categories,
      tags: contact.tags,
      relationshipStrength: contact.relationshipStrength,
      strategicValue: contact.strategicValue,
      targetCadenceDays: contact.targetCadenceDays,
      lastInteractionDate: contact.lastInteractionDate,
    },
    recentInteractions: contact.interactions.map(i => ({
      date: i.date,
      type: i.type,
      summary: i.summary,
      commitments: i.commitments,
    })),
    unfulfilledCommitments,
    recentSignals: contact.signals.map(s => ({
      signalType: s.signalType,
      title: s.title,
      description: s.description,
      detectedAt: s.detectedAt,
    })),
    sharedEvents,
    daysSinceLastInteraction,
    meetingTitle: meetingTitle || null,
    meetingTime: meetingTime || null,
  }
}

export async function generatePrepBrief(context: PrepContext): Promise<string> {
  const systemPrompt = `You are a meeting preparation assistant for Stephen Andrews, a senior government attorney at the CFTC specializing in commodity regulation, crypto regulatory policy, and administrative law reform.

Generate a concise, actionable meeting prep brief. Focus on:
1. Key context Stephen needs before walking into this meeting
2. Any outstanding commitments or promises that need addressing
3. Recent intelligence that creates natural conversation openers
4. Specific, non-generic talking points based on the relationship history

Return the brief in this exact format:

CONTEXT:
- [2-3 bullet points about the relationship status, recency, and any relevant dynamics]

UNFULFILLED COMMITMENTS:
- [List any open commitments, or "None"]

SUGGESTED TALKING POINTS:
- [3-4 specific, actionable talking points based on signals, history, and shared interests]

NEW INTEL SINCE LAST MEETING:
- [Recent signals, news, or developments relevant to this contact, or "None"]

RELATIONSHIP NOTES:
- [Any strategic considerations: cadence pressure, relationship trajectory, strategic value]`

  const cadenceStatus = context.daysSinceLastInteraction !== null
    ? `${context.daysSinceLastInteraction} days since last interaction (target cadence: ${context.contact.targetCadenceDays} days)${context.daysSinceLastInteraction > context.contact.targetCadenceDays ? ' — OVERDUE' : ''}`
    : 'No previous interactions recorded'

  const userPrompt = `Generate a meeting prep brief for the following meeting:

MEETING:
- Title: ${context.meetingTitle || 'Meeting'}
${context.meetingTime ? `- Time: ${context.meetingTime}` : ''}

CONTACT:
- Name: ${context.contact.name}
- Title: ${context.contact.title || 'Unknown'}
- Organization: ${context.contact.organization || 'Unknown'}
- Tier: ${context.contact.tier} (${context.contact.tier === 1 ? 'highest priority' : context.contact.tier === 2 ? 'medium priority' : 'lower priority'})
- Why they matter: ${context.contact.whyTheyMatter || 'N/A'}
- Connection context: ${context.contact.connectionToHawleyOrbit || 'N/A'}
- Notes: ${context.contact.notes || 'None'}
- Relationship Strength: ${context.contact.relationshipStrength}/10
- Strategic Value: ${context.contact.strategicValue}/10
- Cadence: ${cadenceStatus}

RECENT INTERACTIONS (last 5):
${context.recentInteractions.length > 0
    ? context.recentInteractions.map(i => `- ${i.date}: ${i.type} — ${i.summary || 'No summary'}`).join('\n')
    : '- No previous interactions recorded'}

UNFULFILLED COMMITMENTS:
${context.unfulfilledCommitments.length > 0
    ? context.unfulfilledCommitments.map(c =>
        `- ${c.description}${c.dueDate ? ` (due: ${c.dueDate}${c.daysOverdue !== null && c.daysOverdue > 0 ? `, ${c.daysOverdue}d overdue` : ''})` : ''}`
      ).join('\n')
    : '- None'}

RECENT INTELLIGENCE SIGNALS (last 90 days):
${context.recentSignals.length > 0
    ? context.recentSignals.map(s => `- ${s.detectedAt}: [${s.signalType}] ${s.title}${s.description ? ` — ${s.description}` : ''}`).join('\n')
    : '- No recent signals'}

SHARED EVENTS:
${context.sharedEvents.length > 0
    ? context.sharedEvents.map(e => `- ${e.name} (${e.dateStart || 'TBD'}) — contact is ${e.role}`).join('\n')
    : '- None'}

Generate the meeting prep brief now.`

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1500,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  })

  return message.content
    .filter(block => block.type === 'text')
    .map(block => (block as { type: 'text'; text: string }).text)
    .join('')
}
