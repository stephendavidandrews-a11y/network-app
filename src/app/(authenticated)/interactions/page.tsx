import { prisma } from '@/lib/db'
import { InteractionsPageContent } from '@/components/interactions/InteractionsPageContent'

export default async function InteractionsPage() {
  const interactions = await prisma.interaction.findMany({
    orderBy: { date: 'desc' },
    take: 50,
    include: { contact: true },
  })

  const enriched = interactions.map(i => ({
    ...i,
    commitments: JSON.parse(i.commitments || '[]'),
    newContactsMentioned: JSON.parse(i.newContactsMentioned || '[]'),
    contactName: i.contact.name,
    contactOrg: i.contact.organization,
  }))

  return <InteractionsPageContent interactions={enriched} />
}
