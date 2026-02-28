import { prisma } from '@/lib/db'
import { NetworkPageContent } from '@/components/network/NetworkPageContent'

export default async function NetworkPage() {
  const contacts = await prisma.contact.findMany({
    select: {
      id: true,
      name: true,
      organization: true,
      tier: true,
      categories: true,
      strategicValue: true,
      status: true,
    },
  })

  const relationships = await prisma.contactRelationship.findMany()

  const enriched = contacts.map(c => ({
    ...c,
    categories: JSON.parse(c.categories || '[]') as string[],
  }))

  // Category coverage analysis
  const categoryCounts: Record<string, number> = {}
  enriched.forEach(c => {
    c.categories.forEach(cat => {
      categoryCounts[cat] = (categoryCounts[cat] || 0) + 1
    })
  })

  return (
    <NetworkPageContent
      contacts={enriched}
      relationships={relationships}
      categoryCounts={categoryCounts}
    />
  )
}
