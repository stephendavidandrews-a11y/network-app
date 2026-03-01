import { prisma } from '@/lib/db'
import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { DraftEditorPage } from '@/components/outreach/DraftEditorPage'
import { parseJsonField } from '@/lib/utils'

export default async function OutreachEditPage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const outreach = await prisma.outreachQueue.findUnique({
    where: { id: params.id },
    include: {
      contact: {
        include: {
          interactions: { orderBy: { date: 'desc' }, take: 10 },
          signals: { orderBy: { detectedAt: 'desc' }, take: 10 },
          outreachItems: {
            where: { status: 'sent' },
            orderBy: { sentAt: 'desc' },
            take: 5,
          },
        },
      },
    },
  })

  if (!outreach) redirect('/outreach')

  const contact = {
    id: outreach.contact.id,
    name: outreach.contact.name,
    title: outreach.contact.title,
    organization: outreach.contact.organization,
    email: outreach.contact.email,
    tier: outreach.contact.tier,
    whyTheyMatter: outreach.contact.whyTheyMatter,
    connectionToHawleyOrbit: outreach.contact.connectionToHawleyOrbit,
    notes: outreach.contact.notes,
    categories: parseJsonField<string[]>(outreach.contact.categories, []),
    tags: parseJsonField<string[]>(outreach.contact.tags, []),
    lastInteractionDate: outreach.contact.lastInteractionDate,
    status: outreach.contact.status,
  }

  const interactions = outreach.contact.interactions.map(i => ({
    id: i.id,
    type: i.type,
    date: i.date,
    summary: i.summary,
  }))

  const signals = outreach.contact.signals.map(s => ({
    id: s.id,
    signalType: s.signalType,
    title: s.title,
    description: s.description,
    detectedAt: s.detectedAt,
    outreachHook: s.outreachHook,
  }))

  const previousOutreach = outreach.contact.outreachItems.map(o => ({
    id: o.id,
    draftSubject: o.draftSubject,
    sentAt: o.sentAt,
  }))

  return (
    <DraftEditorPage
      outreach={{
        id: outreach.id,
        contactId: outreach.contactId,
        triggerType: outreach.triggerType,
        triggerDescription: outreach.triggerDescription,
        draftSubject: outreach.draftSubject,
        draftBody: outreach.draftBody,
        draftFormat: outreach.draftFormat,
        status: outreach.status,
        priority: outreach.priority,
      }}
      contact={contact}
      interactions={interactions}
      signals={signals}
      previousOutreach={previousOutreach}
    />
  )
}
