import { prisma } from '@/lib/db'
import { PersonalContactForm } from '@/components/social/PersonalContactForm'

export default async function NewFriendPage() {
  const groups = await prisma.personalGroup.findMany({ orderBy: { name: 'asc' } })
  return <PersonalContactForm groups={groups.map(g => ({ id: g.id, name: g.name }))} />
}
