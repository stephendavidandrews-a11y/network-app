import { prisma } from '@/lib/db'
import { InteractionFormPage } from '@/components/interactions/InteractionFormPage'

export default async function NewInteractionPage({
  searchParams,
}: {
  searchParams: { contact?: string; mode?: string }
}) {
  const contacts = await prisma.contact.findMany({
    orderBy: { name: 'asc' },
    select: { id: true, name: true, organization: true },
  })

  return (
    <InteractionFormPage
      contacts={contacts}
      preselectedContactId={searchParams.contact}
      initialMode={searchParams.mode}
    />
  )
}
