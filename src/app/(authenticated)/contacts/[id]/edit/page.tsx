import { prisma } from '@/lib/db'
import { notFound } from 'next/navigation'
import { ContactFormPage } from '@/components/contacts/ContactFormPage'

export default async function EditContactPage({
  params,
}: {
  params: { id: string }
}) {
  const contact = await prisma.contact.findUnique({
    where: { id: params.id },
  })

  if (!contact) notFound()

  return (
    <ContactFormPage
      contact={{
        ...contact,
        categories: JSON.parse(contact.categories || '[]'),
        tags: JSON.parse(contact.tags || '[]'),
      }}
    />
  )
}
