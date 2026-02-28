import { prisma } from '@/lib/db'
import { OutreachPageContent } from '@/components/outreach/OutreachPageContent'

export default async function OutreachPage() {
  const queue = await prisma.outreachQueue.findMany({
    where: { status: { in: ['queued', 'drafted', 'review', 'approved'] } },
    orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
    include: { contact: true, signal: true },
  })

  const history = await prisma.outreachQueue.findMany({
    where: { status: 'sent' },
    orderBy: { sentAt: 'desc' },
    take: 50,
    include: { contact: true },
  })

  const enrichedQueue = queue.map(item => ({
    ...item,
    contactName: item.contact.name,
    contactOrg: item.contact.organization,
    contactTier: item.contact.tier,
  }))

  const enrichedHistory = history.map(item => ({
    ...item,
    contactName: item.contact.name,
    contactOrg: item.contact.organization,
    wasEdited: item.wasEdited,
  }))

  return <OutreachPageContent queue={enrichedQueue} history={enrichedHistory} />
}
