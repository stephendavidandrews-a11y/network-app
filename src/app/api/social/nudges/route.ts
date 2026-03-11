import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { generateDailyNudges } from '@/lib/nudge-engine'
import { generateDraftText, saveDraftCorrection } from '@/lib/draft-text'
import { sendIMessage } from '@/lib/imessage'
import { daysSinceLastContact, getLastMessageDates, getCommStatsMap } from '@/lib/contact-activity'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const date = searchParams.get('date') || new Date().toISOString().split('T')[0]
    const status = searchParams.get('status') // optional filter

    const where: Record<string, unknown> = { scheduledFor: date }
    if (status) where.status = status

    const nudges = await prisma.personalNudge.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    })

    // Enrich with contact names
    const enriched = await Promise.all(
      nudges.map(async (n) => {
        const contactIds = JSON.parse(n.contactIds || '[]') as string[]
        const contacts = await prisma.contact.findMany({
          where: { id: { in: contactIds } },
          select: { id: true, name: true, personalRing: true, phone: true },
        })
        return {
          ...n,
          contacts: contacts.map(c => ({
            id: c.id,
            name: c.name,
            ring: c.personalRing || 'new',
            hasPhone: !!c.phone,
          })),
        }
      })
    )

    return NextResponse.json(enriched)
  } catch (error) {
    console.error('[Nudges] GET error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action, nudgeId } = body

    switch (action) {
      case 'generate': {
        const nudges = await generateDailyNudges()
        return NextResponse.json(nudges)
      }

      case 'complete': {
        if (!nudgeId) {
          return NextResponse.json({ error: 'nudgeId required' }, { status: 400 })
        }
        const updated = await prisma.personalNudge.update({
          where: { id: nudgeId },
          data: {
            status: 'completed',
            completedAt: new Date().toISOString(),
          },
        })
        return NextResponse.json(updated)
      }

      case 'dismiss': {
        if (!nudgeId) {
          return NextResponse.json({ error: 'nudgeId required' }, { status: 400 })
        }
        const updated = await prisma.personalNudge.update({
          where: { id: nudgeId },
          data: { status: 'dismissed' },
        })
        return NextResponse.json(updated)
      }

      case 'draft': {
        const { contactId } = body
        if (!contactId) {
          return NextResponse.json({ error: 'contactId required' }, { status: 400 })
        }

        // Determine nudge type for draft purpose
        const nudge = nudgeId
          ? await prisma.personalNudge.findUnique({ where: { id: nudgeId } })
          : null

        const purposeMap: Record<string, string> = {
          overdue_reachout: 'reachout',
          birthday: 'birthday',
          life_event: 'followup',
          dropped_ball: 'followup',
          fading_momentum: 'reachout',
          new_contact_followup: 'followup',
        }
        const purpose = purposeMap[nudge?.nudgeType || ''] || 'reachout'

        // ─── Gather rich relationship context ────────────
        const [contact, lifeEvents, interests, groups, commStatsMap, lastMsgDates] = await Promise.all([
          prisma.contact.findUnique({
            where: { id: contactId },
            select: {
              name: true, personalRing: true, howWeMet: true, city: true,
              personalCadenceDays: true, lastInteractionDate: true,
            },
          }),
          prisma.lifeEvent.findMany({
            where: { contactId },
            take: 5,
            orderBy: { eventDate: 'desc' },
            select: { description: true, eventDate: true, eventType: true, recurring: true },
          }),
          prisma.personalInterest.findMany({
            where: { contactId },
            select: { interest: true },
          }),
          prisma.personalGroupMember.findMany({
            where: { contactId },
            include: { group: { select: { name: true } } },
          }),
          getCommStatsMap([contactId]),
          getLastMessageDates([contactId]),
        ])

        // Build hooks from multiple sources
        const hooks: string[] = []

        // Life events as hooks
        for (const e of lifeEvents) {
          if (e.description) {
            if (e.recurring && e.eventType === 'birthday') {
              // Check if birthday is coming up
              const today = new Date()
              if (e.eventDate) {
                const m = parseInt(e.eventDate.slice(5, 7))
                const d = parseInt(e.eventDate.slice(8, 10))
                for (let i = 0; i <= 7; i++) {
                  const check = new Date(today.getTime() + i * 86400000)
                  if (check.getMonth() + 1 === m && check.getDate() === d) {
                    hooks.push(i === 0 ? 'birthday is today' : `birthday in ${i} days`)
                    break
                  }
                }
              }
            } else {
              hooks.push(e.description)
            }
          }
        }

        // Shared interests
        if (interests.length > 0) {
          hooks.push(`shared interests: ${interests.map(i => i.interest).join(', ')}`)
        }

        // Build context string with relationship info
        const contextParts: string[] = []

        if (contact?.howWeMet) {
          contextParts.push(`How we met: ${contact.howWeMet}`)
        }

        // Groups
        if (groups.length > 0) {
          contextParts.push(`Mutual groups: ${groups.map(g => g.group.name).join(', ')}`)
        }

        // Comm stats
        const stats = commStatsMap.get(contactId)
        if (stats) {
          if (stats.trend === 'fading') contextParts.push('Communication has been fading lately')
          if (stats.reciprocityPattern === 'they_initiate') contextParts.push('They usually text first — Stephen should initiate this time')
          if (stats.reciprocityPattern === 'i_initiate') contextParts.push('Stephen usually texts first')
        }

        // Days since last contact
        const days = daysSinceLastContact(
          contact?.lastInteractionDate || null,
          lastMsgDates.get(contactId) || null
        )
        if (days !== null) {
          const cadence = contact?.personalCadenceDays || 21
          if (days > cadence * 2) {
            contextParts.push(`It's been ${days} days since last contact — quite a while`)
          } else if (days > cadence) {
            contextParts.push(`${days} days since last contact, a bit overdue`)
          }
        }

        const customContext = contextParts.length > 0 ? contextParts.join('. ') : undefined

        const result = await generateDraftText({
          contactId,
          planType: purpose,
          hooks,
          customContext,
        })

        return NextResponse.json(result)
      }

      case 'send': {
        const { contactId, message } = body
        if (!contactId || !message) {
          return NextResponse.json({ error: 'contactId and message required' }, { status: 400 })
        }

        const contact = await prisma.contact.findUnique({
          where: { id: contactId },
          select: { name: true, phone: true },
        })
        if (!contact) {
          return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
        }
        if (!contact.phone) {
          return NextResponse.json({ error: `${contact.name} has no phone number` }, { status: 400 })
        }

        const result = await sendIMessage(contact.phone, message)

        // Auto-complete the nudge if send succeeded
        if (result.success && nudgeId) {
          await prisma.personalNudge.update({
            where: { id: nudgeId },
            data: { status: 'completed', completedAt: new Date().toISOString() },
          })
        }

        return NextResponse.json({
          success: result.success,
          sentTo: contact.name,
          error: result.error,
          nudgeCompleted: result.success && !!nudgeId,
        })
      }

      case 'save_correction': {
        const { contactId, originalDraft, editedDraft, voiceSource } = body
        if (!originalDraft || !editedDraft) {
          return NextResponse.json({ error: 'originalDraft and editedDraft required' }, { status: 400 })
        }

        // Determine purpose from nudge type
        const nudge = nudgeId
          ? await prisma.personalNudge.findUnique({ where: { id: nudgeId } })
          : null
        const purposeMap: Record<string, string> = {
          overdue_reachout: 'reachout',
          birthday: 'birthday',
          life_event: 'followup',
          dropped_ball: 'followup',
          fading_momentum: 'reachout',
          new_contact_followup: 'followup',
        }
        const purpose = purposeMap[nudge?.nudgeType || ''] || 'reachout'

        await saveDraftCorrection({
          contactId: contactId || undefined,
          purpose,
          originalDraft,
          editedDraft,
          voiceSource: voiceSource || '',
        })

        return NextResponse.json({ success: true })
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
    }
  } catch (error) {
    console.error('[Nudges] POST error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
