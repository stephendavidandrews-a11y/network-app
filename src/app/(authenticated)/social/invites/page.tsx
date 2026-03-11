import { prisma } from '@/lib/db'
import { InviteRequestsContent } from '@/components/social/InviteRequestsContent'

export default async function InvitesPage() {
  const inviteRequests = await prisma.inviteRequest.findMany({
    include: {
      event: { select: { id: true, title: true, date: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  return <InviteRequestsContent inviteRequests={inviteRequests} />
}
