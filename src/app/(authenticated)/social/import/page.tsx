import { prisma } from '@/lib/db'
import { TriageContent } from '@/components/social/TriageContent'

export default async function TriagePage() {
  // Get triage candidates: unmatched phone numbers with 20+ messages
  const mainQueue = await prisma.textContactCommStats.findMany({
    where: {
      contactId: null,
      triageStatus: null,
      totalMessages: { gte: 20 },
    },
    orderBy: { totalWeightedScore: 'desc' },
  })

  // Warm leads: 3-19 messages, recent activity
  const twelveMonthsAgo = new Date()
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12)
  const thirteenMonthsAgo = new Date()
  thirteenMonthsAgo.setMonth(thirteenMonthsAgo.getMonth() - 13)

  const warmLeads = await prisma.textContactCommStats.findMany({
    where: {
      contactId: null,
      triageStatus: null,
      totalMessages: { gte: 3, lte: 19 },
      lastMessageDate: { gte: twelveMonthsAgo.toISOString() },
      firstMessageDate: { gte: thirteenMonthsAgo.toISOString() },
    },
    orderBy: { totalWeightedScore: 'desc' },
  })

  // Sync metadata
  const syncMeta = await prisma.textSyncMetadata.findFirst()

  // Total contacts for progress
  const totalContacts = await prisma.contact.count()

  return (
    <TriageContent
      mainQueue={mainQueue}
      warmLeads={warmLeads}
      syncMeta={syncMeta}
      totalContacts={totalContacts}
    />
  )
}
