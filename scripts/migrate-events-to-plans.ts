/**
 * One-time migration: move SocialEvent records into SocialPlan (unified model).
 *
 * Run with: npx tsx scripts/migrate-events-to-plans.ts
 */

import { PrismaClient } from '@prisma/client'
import { randomUUID } from 'crypto'

const prisma = new PrismaClient()

async function main() {
  const events = await prisma.socialEvent.findMany({
    include: {
      attendees: {
        include: { contact: { select: { id: true, name: true, phone: true, personalRing: true, funnelStage: true } } },
      },
    },
  })

  console.log(`Found ${events.length} SocialEvent(s) to migrate`)

  for (const event of events) {
    // Check if already migrated (by title match)
    const existing = await prisma.socialPlan.findFirst({
      where: { title: event.title || undefined },
    })
    if (existing) {
      console.log(`  Skipping "${event.title}" — already migrated as plan ${existing.id}`)
      continue
    }

    // Map eventType to planType
    const typeMap: Record<string, string> = {
      happy_hour: 'happy_hour',
      dinner: 'dinner',
      party: 'party',
      golf: 'golf',
      activity: 'golf', // activity was used for golf
      other: 'happy_hour',
    }
    const planType = typeMap[event.eventType] || 'happy_hour'

    // Build suggestedContacts JSON from attendees
    const suggestedContacts = event.attendees.map(a => ({
      contactId: a.contact.id,
      name: a.contact.name,
      phone: a.contact.phone,
      ring: a.contact.personalRing || 'new',
      funnelStage: a.contact.funnelStage,
      score: 0,
      reasoning: 'migrated from event',
      hooks: [],
    }))

    const plan = await prisma.socialPlan.create({
      data: {
        planType,
        targetDate: event.date,
        suggestedContacts: JSON.stringify(suggestedContacts),
        suggestedVenueId: event.venueId,
        groupReasoning: '',
        status: 'approved',
        approvedAt: new Date().toISOString(),
        title: event.title,
        time: event.time,
        notes: event.notes,
        publicVisibility: event.publicVisibility,
        location: event.location,
        description: event.description,
        coHosted: event.coHosted,
      },
    })

    console.log(`  Migrated "${event.title}" → plan ${plan.id} (${planType}, ${event.date})`)

    // Create SocialPlanAttendee records
    for (const a of event.attendees) {
      await prisma.socialPlanAttendee.create({
        data: {
          planId: plan.id,
          contactId: a.contactId,
          status: a.status,
          wasPlusOne: a.wasPlusOne,
          invitedBy: a.invitedBy,
        },
      })
    }
    console.log(`    Created ${event.attendees.length} attendee record(s)`)
  }

  console.log('Migration complete!')
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
