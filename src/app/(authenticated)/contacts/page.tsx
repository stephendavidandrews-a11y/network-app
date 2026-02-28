import { prisma } from '@/lib/db'
import { ContactsPageContent } from '@/components/contacts/ContactsPageContent'

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined }
}) {
  const tier = searchParams.tier ? String(searchParams.tier) : undefined
  const status = searchParams.status ? String(searchParams.status) : undefined
  const overdue = searchParams.overdue === 'true'
  const search = searchParams.search ? String(searchParams.search) : undefined
  const sort = searchParams.sort ? String(searchParams.sort) : 'tier'

  const where: Record<string, unknown> = {}
  if (tier) where.tier = parseInt(tier)
  if (status) where.status = status

  let contacts = await prisma.contact.findMany({
    where,
    orderBy: sort === 'name' ? { name: 'asc' }
      : sort === 'tier' ? { tier: 'asc' }
      : sort === 'strategic_value' ? { strategicValue: 'desc' }
      : sort === 'relationship' ? { relationshipStrength: 'desc' }
      : sort === 'last_interaction' ? { lastInteractionDate: 'asc' }
      : sort === 'created' ? { createdAt: 'desc' }
      : { tier: 'asc' },
  })

  // Client-side search filter (FTS5 requires raw query, falling back to simple filter for now)
  if (search) {
    const q = search.toLowerCase()
    contacts = contacts.filter(c =>
      c.name.toLowerCase().includes(q) ||
      (c.organization?.toLowerCase().includes(q)) ||
      (c.title?.toLowerCase().includes(q)) ||
      (c.notes?.toLowerCase().includes(q))
    )
  }

  if (overdue) {
    contacts = contacts.filter(c => {
      if (!c.lastInteractionDate) return true
      const days = Math.floor((Date.now() - new Date(c.lastInteractionDate).getTime()) / (1000 * 60 * 60 * 24))
      return days > c.targetCadenceDays
    })
  }

  const enriched = contacts.map(c => ({
    ...c,
    categories: JSON.parse(c.categories || '[]') as string[],
    tags: JSON.parse(c.tags || '[]') as string[],
    daysSinceInteraction: c.lastInteractionDate
      ? Math.floor((Date.now() - new Date(c.lastInteractionDate).getTime()) / (1000 * 60 * 60 * 24))
      : null,
    isOverdue: !c.lastInteractionDate || (
      Math.floor((Date.now() - new Date(c.lastInteractionDate).getTime()) / (1000 * 60 * 60 * 24)) > c.targetCadenceDays
    ),
  }))

  const categoryCounts: Record<string, number> = {}
  enriched.forEach(c => {
    c.categories.forEach((cat: string) => {
      categoryCounts[cat] = (categoryCounts[cat] || 0) + 1
    })
  })

  return (
    <ContactsPageContent
      contacts={enriched}
      categoryCounts={categoryCounts}
      filters={{ tier, status, overdue, search, sort }}
    />
  )
}
