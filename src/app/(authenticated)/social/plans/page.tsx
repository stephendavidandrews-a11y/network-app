import { prisma } from '@/lib/db'
import { PlansContent } from '@/components/social/PlansContent'

async function getPlansData() {
  const plans = await prisma.socialPlan.findMany({
    include: {
      venue: { select: { id: true, name: true, venueType: true, city: true } },
    },
    orderBy: { targetDate: 'desc' },
  })

  const venues = await prisma.personalVenue.findMany({
    select: { id: true, name: true, venueType: true, city: true },
    orderBy: { name: 'asc' },
  })

  const contacts = await prisma.contact.findMany({
    where: { contactType: { in: ['personal', 'both'] } },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  })

  return {
    plans: plans.map(p => ({
      ...p,
      suggestedContacts: JSON.parse(p.suggestedContacts || '[]'),
      alternativeVenueIds: JSON.parse(p.alternativeVenueIds || '[]'),
    })),
    venues,
    contacts,
  }
}

export default async function PlansPage() {
  const data = await getPlansData()
  return <PlansContent data={data} />
}
