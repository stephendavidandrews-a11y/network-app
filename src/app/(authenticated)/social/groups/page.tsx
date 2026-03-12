import { prisma } from '@/lib/db'
import { PersonalGroupsContent } from '@/components/social/PersonalGroupsContent'

export default async function GroupsPage() {
  const groups = await prisma.personalGroup.findMany({
    include: {
      members: {
        include: {
          contact: {
            select: { id: true, name: true, photoUrl: true, personalRing: true, lastInteractionDate: true },
          },
        },
      },
    },
    orderBy: { name: 'asc' },
  })

  const data = groups.map(g => ({
    id: g.id, name: g.name, description: g.description,
    members: g.members.map(m => ({
      id: m.contact.id, name: m.contact.name, photoUrl: m.contact.photoUrl,
      ring: m.contact.personalRing, lastInteraction: m.contact.lastInteractionDate,
    })),
  }))

  return <PersonalGroupsContent groups={data} />
}
