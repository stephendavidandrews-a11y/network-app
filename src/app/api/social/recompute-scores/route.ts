import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { calculateRelationshipStrength } from '@/lib/scoring'
import { getCommStatsMap } from '@/lib/contact-activity'

export async function POST() {
  try {
    const contacts = await prisma.contact.findMany({
      select: {
        id: true,
        tier: true,
        strategicValue: true,
        lastInteractionDate: true,
        targetCadenceDays: true,
        categories: true,
        relationshipStrength: true,
      },
    })

    const interactions = await prisma.interaction.findMany({
      select: { contactId: true, type: true, date: true },
    })

    const interactionsByContact = new Map<string, Array<{ type: string; date: string }>>()
    for (const i of interactions) {
      const list = interactionsByContact.get(i.contactId) || []
      list.push({ type: i.type, date: i.date })
      interactionsByContact.set(i.contactId, list)
    }

    const commStatsMap = await getCommStatsMap(contacts.map(c => c.id))

    let updated = 0
    for (const c of contacts) {
      const contact = {
        tier: c.tier,
        strategicValue: c.strategicValue,
        lastInteractionDate: c.lastInteractionDate,
        targetCadenceDays: c.targetCadenceDays,
        categories: JSON.parse(c.categories || '[]') as string[],
      }

      const contactInteractions = interactionsByContact.get(c.id) || []
      const commStats = commStatsMap.get(c.id) || null

      const newStrength = calculateRelationshipStrength(contact, contactInteractions, commStats)

      if (newStrength !== c.relationshipStrength) {
        await prisma.contact.update({
          where: { id: c.id },
          data: { relationshipStrength: newStrength },
        })
        updated++
      }
    }

    return NextResponse.json({
      success: true,
      total: contacts.length,
      updated,
    })
  } catch (error) {
    console.error('Recompute scores error:', error)
    return NextResponse.json(
      { error: 'Failed to recompute scores' },
      { status: 500 }
    )
  }
}
