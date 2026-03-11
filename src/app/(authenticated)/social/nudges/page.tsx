import { prisma } from '@/lib/db'
import { NudgesContent } from '@/components/social/NudgesContent'

async function getNudgeData() {
  const today = new Date().toISOString().split('T')[0]

  const nudges = await prisma.personalNudge.findMany({
    where: { scheduledFor: today },
    orderBy: { createdAt: 'desc' },
  })

  // Enrich with contact info
  const enriched = await Promise.all(
    nudges.map(async (n) => {
      const contactIds = JSON.parse(n.contactIds || '[]') as string[]
      const contacts = await prisma.contact.findMany({
        where: { id: { in: contactIds } },
        select: { id: true, name: true, personalRing: true, phone: true },
      })
      return {
        id: n.id,
        nudgeType: n.nudgeType,
        reasoning: n.reasoning,
        suggestedAction: n.suggestedAction,
        status: n.status,
        scheduledFor: n.scheduledFor,
        completedAt: n.completedAt,
        contacts: contacts.map(c => ({
          id: c.id,
          name: c.name,
          ring: c.personalRing || 'new',
          hasPhone: !!c.phone,
        })),
      }
    })
  )

  // Streak: consecutive days with at least 1 completed nudge
  let streak = 0
  for (let d = 1; d <= 90; d++) {
    const date = new Date(Date.now() - d * 86400000).toISOString().split('T')[0]
    const completed = await prisma.personalNudge.findFirst({
      where: { scheduledFor: date, status: 'completed' },
    })
    if (completed) {
      streak++
    } else {
      break
    }
  }

  // Today's completed count
  const completedToday = enriched.filter(n => n.status === 'completed').length

  return {
    nudges: enriched,
    completedToday,
    streak,
    totalToday: enriched.length,
    pendingToday: enriched.filter(n => n.status === 'pending').length,
  }
}

export default async function NudgesPage() {
  const data = await getNudgeData()
  return <NudgesContent data={data} />
}
