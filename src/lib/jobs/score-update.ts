import { PrismaClient } from '@prisma/client'
import { calculateRelationshipStrength, calculateStrategicValue } from '../scoring'

export async function runScoreUpdate(prisma: PrismaClient): Promise<{ updated: number }> {
  const contacts = await prisma.contact.findMany({
    include: {
      interactions: {
        orderBy: { date: 'desc' },
        take: 20,
      },
    },
  })

  let updated = 0

  for (const contact of contacts) {
    let categories: string[] = []
    try { categories = JSON.parse(contact.categories || '[]') } catch { /* ignore */ }

    const newRelStrength = calculateRelationshipStrength(
      {
        tier: contact.tier,
        strategicValue: contact.strategicValue,
        lastInteractionDate: contact.lastInteractionDate,
        targetCadenceDays: contact.targetCadenceDays,
        categories,
      },
      contact.interactions.map(i => ({ type: i.type, date: i.date }))
    )

    const newStrategicValue = calculateStrategicValue({
      tier: contact.tier,
      strategicValue: contact.strategicValue,
      lastInteractionDate: contact.lastInteractionDate,
      targetCadenceDays: contact.targetCadenceDays,
      categories,
    })

    if (
      contact.relationshipStrength !== newRelStrength ||
      contact.strategicValue !== newStrategicValue
    ) {
      await prisma.contact.update({
        where: { id: contact.id },
        data: {
          relationshipStrength: newRelStrength,
          strategicValue: newStrategicValue,
          updatedAt: new Date().toISOString(),
        },
      })
      updated++
    }
  }

  return { updated }
}
