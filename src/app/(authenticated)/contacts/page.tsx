import { prisma } from '@/lib/db'
import { daysSinceLastContact, getLastMessageDates } from '@/lib/contact-activity'
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
  const contactType = searchParams.type ? String(searchParams.type) : undefined

  const where: Record<string, unknown> = {}
  if (tier) where.tier = parseInt(tier)
  if (status) where.status = status
  if (contactType) where.contactType = contactType

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

  const lastMsgDates = await getLastMessageDates(contacts.map(c => c.id))

  if (overdue) {
    contacts = contacts.filter(c => {
      // Skip pathway/org-entry/low-access/deferred contacts
      const mode = (c as Record<string, unknown>).outreachMode as string | null
      const access = (c as Record<string, unknown>).accessibility as string | null
      const timing = (c as Record<string, unknown>).outreachTiming as string | null
      if (mode === 'pathway' || mode === 'org-entry') return false
      if (access === 'low') return false
      if (timing === 'wait_cftc' || timing === 'warm_intro_needed') return false

      const days = daysSinceLastContact(c.lastInteractionDate, lastMsgDates.get(c.id) || null)
      return days === null || days > c.targetCadenceDays
    })
  }

  const enriched = contacts.map(c => {
    const days = daysSinceLastContact(c.lastInteractionDate, lastMsgDates.get(c.id) || null)
    return {
      ...c,
      categories: JSON.parse(c.categories || '[]') as string[],
      tags: JSON.parse(c.tags || '[]') as string[],
      daysSinceInteraction: days,
      isOverdue: (() => {
        const mode = (c as Record<string, unknown>).outreachMode as string | null
        const access = (c as Record<string, unknown>).accessibility as string | null
        const timing = (c as Record<string, unknown>).outreachTiming as string | null
        if (mode === 'pathway' || mode === 'org-entry') return false
        if (access === 'low') return false
        if (timing === 'wait_cftc' || timing === 'warm_intro_needed') return false
        return days === null || days > c.targetCadenceDays
      })(),
    }
  })

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
      filters={{ tier, status, overdue, search, sort, type: contactType }}
    />
  )
}
