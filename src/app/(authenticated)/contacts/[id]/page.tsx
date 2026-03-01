import { prisma } from '@/lib/db'
import { notFound } from 'next/navigation'
import { ContactDetailContent } from '@/components/contacts/ContactDetailContent'

export default async function ContactDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const contact = await prisma.contact.findUnique({
    where: { id: params.id },
    include: {
      interactions: {
        orderBy: { date: 'desc' },
        take: 20,
      },
      signals: {
        orderBy: { detectedAt: 'desc' },
        take: 10,
      },
      outreachItems: {
        orderBy: { createdAt: 'desc' },
        take: 10,
      },
    },
  })

  if (!contact) notFound()

  const relationships = await prisma.contactRelationship.findMany({
    where: {
      OR: [
        { contactAId: params.id },
        { contactBId: params.id },
      ],
    },
  })

  // Get related contact names
  const relatedIds = relationships.map(r =>
    r.contactAId === params.id ? r.contactBId : r.contactAId
  )
  const relatedContacts = relatedIds.length > 0
    ? await prisma.contact.findMany({
        where: { id: { in: relatedIds } },
        select: { id: true, name: true, organization: true, tier: true },
      })
    : []

  // Fetch commitments for this contact from dedicated table
  const commitmentRows = await prisma.commitment.findMany({
    where: { contactId: params.id },
    orderBy: [{ fulfilled: 'asc' }, { dueDate: 'asc' }],
  })

  // Fetch most recent meeting prep for this contact (today or yesterday)
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  const latestPrep = await prisma.meetingPrep.findFirst({
    where: {
      contactId: params.id,
      date: { gte: yesterday },
    },
    orderBy: { generatedAt: 'desc' },
  })

  const enriched = {
    ...contact,
    categories: JSON.parse(contact.categories || '[]') as string[],
    tags: JSON.parse(contact.tags || '[]') as string[],
    daysSinceInteraction: contact.lastInteractionDate
      ? Math.floor((Date.now() - new Date(contact.lastInteractionDate).getTime()) / (1000 * 60 * 60 * 24))
      : null,
    isOverdue: !contact.lastInteractionDate || (
      Math.floor((Date.now() - new Date(contact.lastInteractionDate).getTime()) / (1000 * 60 * 60 * 24)) > contact.targetCadenceDays
    ),
    interactions: contact.interactions.map(i => ({
      ...i,
      commitments: JSON.parse(i.commitments || '[]'),
      newContactsMentioned: JSON.parse(i.newContactsMentioned || '[]'),
    })),
  }

  return (
    <ContactDetailContent
      contact={enriched}
      relationships={relationships}
      relatedContacts={relatedContacts}
      commitments={commitmentRows.map(c => ({
        id: c.id,
        interactionId: c.interactionId,
        contactId: c.contactId,
        description: c.description,
        dueDate: c.dueDate,
        fulfilled: c.fulfilled,
        fulfilledDate: c.fulfilledDate,
        fulfilledNotes: c.fulfilledNotes,
        reminderSnoozedUntil: c.reminderSnoozedUntil,
        createdAt: c.createdAt,
      }))}
      latestPrep={latestPrep ? {
        id: latestPrep.id,
        briefContent: latestPrep.briefContent,
        generatedAt: latestPrep.generatedAt,
        meetingTitle: latestPrep.meetingTitle,
      } : null}
    />
  )
}
