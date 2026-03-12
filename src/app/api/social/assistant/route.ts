import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { daysSinceLastContact, getLastMessageDates, getCommStatsMap } from '@/lib/contact-activity'
import { generatePlan } from '@/lib/planning-engine'
import { generateDraftText } from '@/lib/draft-text'
import { sendIMessage } from '@/lib/imessage'
import { generateDailyNudges } from '@/lib/nudge-engine'
import { budgetedCreate, truncateForAPI } from '@/lib/api-budget'
// ─── Tool Definitions ─────────────────────────────────

const tools: Anthropic.Tool[] = [
  {
    name: 'search_contacts',
    description: 'Search for contacts by name, ring, city, interests, funnel stage, or overdue status. Returns matching contacts with key info.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Name or keyword search' },
        ring: { type: 'string', description: 'Filter by ring: close, regular, outer, new' },
        city: { type: 'string', description: 'Filter by city name' },
        interest: { type: 'string', description: 'Filter by interest or activity (e.g., golf, running)' },
        funnelStage: { type: 'string', description: 'Filter by funnel stage' },
        overdueOnly: { type: 'boolean', description: 'Only return contacts past their cadence' },
        limit: { type: 'number', description: 'Max results (default 10)' },
      },
      required: [],
    },
  },
  {
    name: 'get_contact_details',
    description: 'Get full profile for one contact including communication stats, life events, recent interactions, and interests.',
    input_schema: {
      type: 'object' as const,
      properties: {
        contactId: { type: 'string', description: 'Contact ID' },
      },
      required: ['contactId'],
    },
  },
  {
    name: 'get_overdue_contacts',
    description: 'Get contacts who are past their communication cadence and need a text. Returns with days overdue and hooks.',
    input_schema: {
      type: 'object' as const,
      properties: {
        ring: { type: 'string', description: 'Filter by ring (close/regular/outer/new)' },
        limit: { type: 'number', description: 'Max results (default 10)' },
      },
      required: [],
    },
  },
  {
    name: 'search_life_events',
    description: 'Find upcoming birthdays, job changes, moves, and other life events within a time window.',
    input_schema: {
      type: 'object' as const,
      properties: {
        eventType: { type: 'string', description: 'Filter by type: birthday, job_change, move, etc.' },
        daysAhead: { type: 'number', description: 'Days into the future to search (default 14)' },
        contactId: { type: 'string', description: 'Filter to specific contact' },
      },
      required: [],
    },
  },
  {
    name: 'generate_plan',
    description: 'Create a social plan (happy hour, golf, dinner, or party). Automatically selects best contacts, venue, and generates group reasoning.',
    input_schema: {
      type: 'object' as const,
      properties: {
        planType: { type: 'string', description: 'Plan type: happy_hour, golf, dinner, or party' },
        targetDate: { type: 'string', description: 'Target date in YYYY-MM-DD format' },
      },
      required: ['planType', 'targetDate'],
    },
  },
  {
    name: 'draft_message',
    description: 'Generate a voice-matched text message for a specific contact. Uses their personal voice profile or archetype.',
    input_schema: {
      type: 'object' as const,
      properties: {
        contactId: { type: 'string', description: 'Contact ID to draft message for' },
        purpose: { type: 'string', description: 'Message purpose: reachout, birthday, followup, happy_hour, golf, dinner, party' },
        customContext: { type: 'string', description: 'Extra context for the message (e.g., "mention the golf trip last month")' },
      },
      required: ['contactId', 'purpose'],
    },
  },
  {
    name: 'send_message',
    description: 'Send a text message via iMessage. IMPORTANT: You must show Stephen the exact message text and get his approval before calling this tool.',
    input_schema: {
      type: 'object' as const,
      properties: {
        contactId: { type: 'string', description: 'Contact ID to send message to' },
        message: { type: 'string', description: 'Exact message text to send' },
      },
      required: ['contactId', 'message'],
    },
  },
  {
    name: 'get_social_stats',
    description: 'Get dashboard-level social statistics: ring counts, momentum summary, overdue count, recent events, pending plans.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'search_venues',
    description: 'Search personal venues by type or name.',
    input_schema: {
      type: 'object' as const,
      properties: {
        type: { type: 'string', description: 'Venue type: bar, restaurant, golf_course, other' },
        query: { type: 'string', description: 'Name search' },
      },
      required: [],
    },
  },
  {
    name: 'get_groups',
    description: 'List personal groups and their members. Can get a single group by ID.',
    input_schema: {
      type: 'object' as const,
      properties: {
        groupId: { type: 'string', description: 'Specific group ID (omit for all groups)' },
      },
      required: [],
    },
  },
  {
    name: 'get_nudges',
    description: "Get today's daily reach-out nudges. These are AI-generated suggestions for who Stephen should text today, with reasoning and draft actions. If none exist yet, generates them automatically.",
    input_schema: {
      type: 'object' as const,
      properties: {
        includeCompleted: { type: 'boolean', description: 'Also include completed/dismissed nudges (default false)' },
      },
      required: [],
    },
  },
  {
    name: 'complete_nudge',
    description: 'Mark a nudge as completed (Stephen reached out to the contact).',
    input_schema: {
      type: 'object' as const,
      properties: {
        nudgeId: { type: 'string', description: 'The nudge ID to mark as completed' },
      },
      required: ['nudgeId'],
    },
  },
  {
    name: 'dismiss_nudge',
    description: 'Dismiss a nudge (skip it for today).',
    input_schema: {
      type: 'object' as const,
      properties: {
        nudgeId: { type: 'string', description: 'The nudge ID to dismiss' },
      },
      required: ['nudgeId'],
    },
  },
]

// ─── Tool Handlers ────────────────────────────────────

async function handleToolCall(name: string, input: Record<string, unknown>): Promise<string> {
  switch (name) {
    case 'search_contacts': {
      const { query, ring, city, interest, funnelStage, overdueOnly, limit = 10 } = input as {
        query?: string; ring?: string; city?: string; interest?: string
        funnelStage?: string; overdueOnly?: boolean; limit?: number
      }

      const where: Record<string, unknown> = {
        contactType: { in: ['personal', 'both'] },
      }
      if (query) where.name = { contains: query, mode: 'insensitive' }
      if (ring) where.personalRing = ring
      if (city) where.city = { contains: city, mode: 'insensitive' }
      if (funnelStage) where.funnelStage = funnelStage

      let contacts = await prisma.contact.findMany({
        where,
        select: {
          id: true, name: true, personalRing: true, funnelStage: true,
          city: true, personalCadenceDays: true, lastInteractionDate: true,
          phone: true,
        },
        take: overdueOnly ? 200 : limit,
        orderBy: { name: 'asc' },
      })

      // Filter by interest
      if (interest) {
        const interestContacts = await prisma.personalInterest.findMany({
          where: { interest: { contains: interest, mode: 'insensitive' } },
          select: { contactId: true },
        })
        const interestIds = new Set(interestContacts.map(i => i.contactId))
        contacts = contacts.filter(c => interestIds.has(c.id))
      }

      const contactIds = contacts.map(c => c.id)
      const lastMsgDates = await getLastMessageDates(contactIds)

      let results = contacts.map(c => {
        const cadence = c.personalCadenceDays || 21
        const days = daysSinceLastContact(c.lastInteractionDate, lastMsgDates.get(c.id) || null)
        return {
          id: c.id,
          name: c.name,
          ring: c.personalRing || 'new',
          funnelStage: c.funnelStage,
          city: c.city,
          daysSinceContact: days,
          cadence,
          overdue: days !== null && days > cadence,
          hasPhone: !!c.phone,
        }
      })

      if (overdueOnly) {
        results = results.filter(r => r.overdue).slice(0, limit)
      }

      return JSON.stringify(results)
    }

    case 'get_contact_details': {
      const { contactId } = input as { contactId: string }
      const contact = await prisma.contact.findUnique({
        where: { id: contactId },
        include: {
          interests: true,
          lifeEvents: { take: 10, orderBy: { eventDate: 'desc' } },
        },
      })
      if (!contact) return JSON.stringify({ error: 'Contact not found' })

      const lastMsgDates = await getLastMessageDates([contactId])
      const commStatsMap = await getCommStatsMap([contactId])
      const stats = commStatsMap.get(contactId)

      const days = daysSinceLastContact(contact.lastInteractionDate, lastMsgDates.get(contactId) || null)

      return JSON.stringify({
        id: contact.id,
        name: contact.name,
        ring: contact.personalRing || 'new',
        funnelStage: contact.funnelStage,
        city: contact.city,
        phone: contact.phone ? '(has phone)' : null,
        howWeMet: contact.howWeMet,
        cadenceDays: contact.personalCadenceDays || 21,
        daysSinceContact: days,
        overdue: days !== null && days > (contact.personalCadenceDays || 21),
        commStats: stats ? {
          trend: stats.trend,
          last30DayCount: stats.last30DayCount,
          last90DayCount: stats.last90DayCount,
          avgPerWeek: stats.avgMessagesPerWeek,
          reciprocityPattern: stats.reciprocityPattern,
        } : null,
        interests: contact.interests.map(i => i.interest),
        lifeEvents: contact.lifeEvents.map(e => ({
          type: (e as Record<string, unknown>).eventType,
          description: e.description,
          date: e.eventDate,
          recurring: e.recurring,
        })),
      })
    }

    case 'get_overdue_contacts': {
      const { ring, limit = 10 } = input as { ring?: string; limit?: number }

      const where: Record<string, unknown> = {
        contactType: { in: ['personal', 'both'] },
      }
      if (ring) where.personalRing = ring

      const contacts = await prisma.contact.findMany({
        where,
        select: {
          id: true, name: true, personalRing: true,
          personalCadenceDays: true, lastInteractionDate: true,
        },
      })

      const contactIds = contacts.map(c => c.id)
      const lastMsgDates = await getLastMessageDates(contactIds)

      const overdue = contacts
        .map(c => {
          const cadence = c.personalCadenceDays || 21
          const days = daysSinceLastContact(c.lastInteractionDate, lastMsgDates.get(c.id) || null)
          return {
            id: c.id,
            name: c.name,
            ring: c.personalRing || 'new',
            daysSinceContact: days,
            cadence,
            overdueRatio: days !== null ? days / cadence : null,
          }
        })
        .filter(c => c.daysSinceContact !== null && c.daysSinceContact > c.cadence)
        .sort((a, b) => (b.overdueRatio || 0) - (a.overdueRatio || 0))
        .slice(0, limit)

      return JSON.stringify(overdue)
    }

    case 'search_life_events': {
      const { eventType, daysAhead = 14, contactId } = input as {
        eventType?: string; daysAhead?: number; contactId?: string
      }

      const where: Record<string, unknown> = {}
      if (eventType) (where as Record<string, unknown>).eventType = eventType
      if (contactId) where.contactId = contactId

      const events = await prisma.lifeEvent.findMany({
        where,
        include: { contact: { select: { id: true, name: true, contactType: true } } },
        orderBy: { eventDate: 'asc' },
      })

      const today = new Date()
      const filtered = events.filter(e => {
        if (!e.contact || !['personal', 'both'].includes(e.contact.contactType)) return false
        if (!e.eventDate) return false

        if (e.recurring) {
          const eventMonth = parseInt(e.eventDate.slice(5, 7))
          const eventDay = parseInt(e.eventDate.slice(8, 10))
          for (let d = 0; d <= daysAhead; d++) {
            const check = new Date(today.getTime() + d * 86400000)
            if (check.getMonth() + 1 === eventMonth && check.getDate() === eventDay) return true
          }
          return false
        }

        const eventDate = new Date(e.eventDate)
        const diffDays = (eventDate.getTime() - today.getTime()) / 86400000
        return diffDays >= 0 && diffDays <= daysAhead
      }).slice(0, 20)

      return JSON.stringify(filtered.map(e => ({
        id: e.id,
        contactName: e.contact?.name,
        contactId: e.contact?.id,
        type: (e as Record<string, unknown>).eventType,
        description: e.description,
        date: e.eventDate,
        recurring: e.recurring,
      })))
    }

    case 'generate_plan': {
      const { planType, targetDate } = input as { planType: string; targetDate: string }
      const plan = await generatePlan(planType, targetDate)
      if (!plan) return JSON.stringify({ error: 'Could not generate plan — not enough eligible contacts' })

      const venue = plan.suggestedVenueId
        ? await prisma.personalVenue.findUnique({ where: { id: plan.suggestedVenueId } })
        : null

      return JSON.stringify({
        planId: plan.id,
        planType: plan.planType,
        targetDate: plan.targetDate,
        status: plan.status,
        contacts: JSON.parse(plan.suggestedContacts || '[]'),
        venue: venue ? { name: venue.name, type: venue.venueType, city: venue.city } : null,
        reasoning: plan.groupReasoning,
      })
    }

    case 'draft_message': {
      const { contactId, purpose, customContext } = input as {
        contactId: string; purpose: string; customContext?: string
      }

      const result = await generateDraftText({
        contactId,
        planType: purpose,
        hooks: [],
        customContext,
      })

      return JSON.stringify({
        draftText: result.draftText,
        voiceSource: result.voiceSource,
      })
    }

    case 'send_message': {
      const { contactId, message } = input as { contactId: string; message: string }

      const contact = await prisma.contact.findUnique({
        where: { id: contactId },
        select: { name: true, phone: true },
      })

      if (!contact) return JSON.stringify({ error: 'Contact not found' })
      if (!contact.phone) return JSON.stringify({ error: `${contact.name} has no phone number on file` })

      const result = await sendIMessage(contact.phone, message)
      return JSON.stringify({
        success: result.success,
        sentTo: contact.name,
        phone: contact.phone,
        error: result.error,
      })
    }

    case 'get_social_stats': {
      const contacts = await prisma.contact.findMany({
        where: { contactType: { in: ['personal', 'both'] } },
        select: { id: true, personalRing: true, personalCadenceDays: true, lastInteractionDate: true },
      })

      const ringCounts = { close: 0, regular: 0, outer: 0, new: 0 }
      contacts.forEach(c => {
        const ring = (c.personalRing || 'new') as keyof typeof ringCounts
        if (ring in ringCounts) ringCounts[ring]++
      })

      const contactIds = contacts.map(c => c.id)
      const lastMsgDates = await getLastMessageDates(contactIds)

      let overdueCount = 0
      contacts.forEach(c => {
        const cadence = c.personalCadenceDays || 21
        const days = daysSinceLastContact(c.lastInteractionDate, lastMsgDates.get(c.id) || null)
        if (days !== null && days > cadence) overdueCount++
      })

      const commStats = await prisma.textContactCommStats.findMany({
        where: { contactId: { not: null } },
        select: { trend: true, last30DayCount: true },
      })

      const trendSummary = { growing: 0, stable: 0, fading: 0, totalMessages30d: 0 }
      commStats.forEach(s => {
        if (s.trend === 'growing') trendSummary.growing++
        else if (s.trend === 'fading') trendSummary.fading++
        else trendSummary.stable++
        trendSummary.totalMessages30d += s.last30DayCount || 0
      })

      const pendingPlans = await prisma.socialPlan.count({ where: { status: { in: ['pending', 'approved'] } } })
      const recentEvents = await prisma.socialPlan.findMany({
        where: { status: 'completed' },
        take: 3,
        orderBy: { targetDate: 'desc' },
        select: { title: true, planType: true, targetDate: true },
      })

      const today = new Date().toISOString().split('T')[0]
      const pendingNudges = await prisma.personalNudge.count({
        where: { scheduledFor: today, status: 'pending' },
      })

      return JSON.stringify({
        totalContacts: contacts.length,
        ringCounts,
        overdueCount,
        momentum: trendSummary,
        pendingPlans,
        pendingNudges,
        recentEvents,
      })
    }

    case 'search_venues': {
      const { type, query } = input as { type?: string; query?: string }
      const where: Record<string, unknown> = {}
      if (type) where.venueType = type
      if (query) where.name = { contains: query, mode: 'insensitive' }

      const venues = await prisma.personalVenue.findMany({
        where,
        orderBy: { name: 'asc' },
      })

      return JSON.stringify(venues.map(v => ({
        id: v.id,
        name: v.name,
        type: v.venueType,
        city: v.city,
        address: v.address,
        notes: v.notes,
      })))
    }

    case 'get_groups': {
      const { groupId } = input as { groupId?: string }

      if (groupId) {
        const group = await prisma.personalGroup.findUnique({
          where: { id: groupId },
          include: {
            members: {
              include: { contact: { select: { id: true, name: true, personalRing: true } } },
            },
          },
        })
        if (!group) return JSON.stringify({ error: 'Group not found' })
        return JSON.stringify({
          id: group.id,
          name: group.name,
          members: group.members.map(m => ({
            id: m.contact.id,
            name: m.contact.name,
            ring: m.contact.personalRing || 'new',
          })),
        })
      }

      const groups = await prisma.personalGroup.findMany({
        include: { members: { include: { contact: { select: { id: true, name: true } } } } },
        orderBy: { name: 'asc' },
      })

      return JSON.stringify(groups.map(g => ({
        id: g.id,
        name: g.name,
        memberCount: g.members.length,
        members: g.members.map(m => m.contact.name),
      })))
    }

    case 'get_nudges': {
      const { includeCompleted } = input as { includeCompleted?: boolean }
      const today = new Date().toISOString().split('T')[0]

      // Check for existing nudges today
      const where: Record<string, unknown> = { scheduledFor: today }
      if (!includeCompleted) where.status = 'pending'

      let nudges = await prisma.personalNudge.findMany({
        where,
        orderBy: { createdAt: 'desc' },
      })

      // If no nudges at all today, generate them
      if (nudges.length === 0) {
        await generateDailyNudges()
        nudges = await prisma.personalNudge.findMany({
          where: { scheduledFor: today, status: 'pending' },
          orderBy: { createdAt: 'desc' },
        })
      }

      // Enrich with contact names
      const enriched = await Promise.all(nudges.map(async n => {
        const contactIds = JSON.parse(n.contactIds || '[]') as string[]
        const contacts = contactIds.length > 0
          ? await prisma.contact.findMany({
              where: { id: { in: contactIds } },
              select: { id: true, name: true, personalRing: true, phone: true },
            })
          : []

        return {
          id: n.id,
          nudgeType: n.nudgeType,
          status: n.status,
          reasoning: n.reasoning,
          suggestedAction: n.suggestedAction,
          contacts: contacts.map(c => ({
            id: c.id,
            name: c.name,
            ring: c.personalRing || 'new',
            hasPhone: !!c.phone,
          })),
          completedAt: n.completedAt,
        }
      }))

      return JSON.stringify(enriched)
    }

    case 'complete_nudge': {
      const { nudgeId } = input as { nudgeId: string }
      const nudge = await prisma.personalNudge.update({
        where: { id: nudgeId },
        data: { status: 'completed', completedAt: new Date().toISOString() },
      })
      return JSON.stringify({ success: true, nudgeId: nudge.id, status: 'completed' })
    }

    case 'dismiss_nudge': {
      const { nudgeId } = input as { nudgeId: string }
      const nudge = await prisma.personalNudge.update({
        where: { id: nudgeId },
        data: { status: 'dismissed' },
      })
      return JSON.stringify({ success: true, nudgeId: nudge.id, status: 'dismissed' })
    }

    default:
      return JSON.stringify({ error: `Unknown tool: ${name}` })
  }
}

// ─── System Prompt ────────────────────────────────────

function buildSystemPrompt(): string {
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })

  return `You are Stephen's social planning assistant. You help him maintain friendships, plan social events, and draft text messages.

TODAY: ${today}

WHAT YOU CAN DO:
- Search and query all contact data (names, rings, cities, interests, communication stats)
- Find who's overdue for a text, who has upcoming birthdays, who's fading
- Generate social plans (happy hour, golf, dinner, party) with optimal guest lists
- Draft personalized text messages that match Stephen's texting voice with each person
- Send messages via iMessage (with Stephen's explicit approval)
- Look up venues, groups, and social stats
- Get today's daily nudges (reach-out suggestions), mark them done or dismiss them

RULES:
1. Be concise and casual — Stephen wants quick answers, not essays
2. When asked about contacts, always use the search tools to get real data. Never guess or make things up
3. When generating plans, present the full plan with contacts, venue, and reasoning
4. When drafting messages, show the draft and ask for approval before sending
5. NEVER send a message without showing Stephen the exact text first and getting his OK
6. For ambiguous requests, ask a brief clarifying question
7. When referencing contacts, include their ring (close/regular/outer/new) for context
8. If asked to plan something, suggest a reasonable target date if none given (default: this or next weekend)

QUICK TIPS:
- "Who should I text?" → use get_nudges (preferred) or get_overdue_contacts
- "Plan a happy hour" → use generate_plan
- "Draft a text for [name]" → use draft_message
- "What's going on this week?" → use search_life_events + get_social_stats
- "What are my nudges?" → use get_nudges
- "Draft reach-outs" → use get_nudges then draft_message for each contact`
}

// ─── Streaming API Handler ────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { messages } = body as { messages: Array<{ role: string; content: string }> }

    if (!process.env.ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ error: 'API key not configured' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Build messages with proper typing
    const apiMessages: Anthropic.MessageParam[] = messages.map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }))

    const encoder = new TextEncoder()

    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Agentic loop: keep going until we get a final text response (no more tool calls)
          let currentMessages = [...apiMessages]
          let iterations = 0
          const MAX_ITERATIONS = 10

          while (iterations < MAX_ITERATIONS) {
            iterations++

            const response = await budgetedCreate({
              model: 'claude-sonnet-4-20250514',
              max_tokens: 2048,
              system: buildSystemPrompt(),
              tools,
              messages: currentMessages,
            }, 'social-assistant')

            // Check if there are tool calls
            const toolUseBlocks = response.content.filter(
              (block): block is Anthropic.ContentBlockParam & { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> } =>
                block.type === 'tool_use'
            )
            const textBlocks = response.content.filter(
              (block): block is Anthropic.TextBlock => block.type === 'text'
            )

            if (toolUseBlocks.length === 0) {
              // No tool calls — stream the final text response
              const text = textBlocks.map(b => b.text).join('')
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'text', content: text })}\n\n`))
              break
            }

            // Process tool calls
            const toolResults: Anthropic.ToolResultBlockParam[] = []

            for (const toolBlock of toolUseBlocks) {
              // Notify client about tool usage
              controller.enqueue(encoder.encode(
                `data: ${JSON.stringify({ type: 'tool_call', tool: toolBlock.name, input: toolBlock.input })}\n\n`
              ))

              const result = await handleToolCall(toolBlock.name, toolBlock.input as Record<string, unknown>)

              toolResults.push({
                type: 'tool_result',
                tool_use_id: toolBlock.id,
                content: result,
              })

              // Send tool result to client for display
              controller.enqueue(encoder.encode(
                `data: ${JSON.stringify({ type: 'tool_result', tool: toolBlock.name, result: JSON.parse(result) })}\n\n`
              ))
            }

            // If there was also text, stream it
            if (textBlocks.length > 0) {
              const text = textBlocks.map(b => b.text).join('')
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'text', content: text })}\n\n`))
            }

            // Add the assistant response and tool results to the conversation
            currentMessages = [
              ...currentMessages,
              { role: 'assistant' as const, content: response.content as Anthropic.ContentBlockParam[] },
              { role: 'user' as const, content: toolResults },
            ]

            // If stop_reason is 'end_turn', we're done even if there were tool calls
            if (response.stop_reason === 'end_turn') {
              break
            }
          }

          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`))
          controller.close()
        } catch (err) {
          console.error('[Assistant] Stream error:', err)
          controller.enqueue(encoder.encode(
            `data: ${JSON.stringify({ type: 'error', message: String(err) })}\n\n`
          ))
          controller.close()
        }
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    })
  } catch (error) {
    console.error('[Assistant] POST error:', error)
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
