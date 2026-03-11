/**
 * Response Tracker — classifies text message responses
 * and matches them to active social plans.
 *
 * After sending invites via iMessage, incoming replies are
 * classified as accepted/declined/maybe and linked to the
 * corresponding plan.
 */

import { prisma } from './db'

type ResponseType = 'accepted' | 'declined' | 'maybe' | 'unknown'

const ACCEPTED_PATTERNS = [
  /\bi['']?m in\b/i,
  /\bcount me in\b/i,
  /\bdown\b/i,
  /\bsee you there\b/i,
  /\bsee you then\b/i,
  /\bsounds good\b/i,
  /\bsounds great\b/i,
  /\bsounds fun\b/i,
  /\bi['']?ll be there\b/i,
  /\bfor sure\b/i,
  /\blet['']?s do it\b/i,
  /\blet['']?s go\b/i,
  /\byeah?\b/i,
  /\byes\b/i,
  /\byep\b/i,
  /\byup\b/i,
  /\bbet\b/i,
  /\bsay less\b/i,
  /\b(i['']?m |i am )?game\b/i,
  /\bperfect\b/i,
  /\bworks for me\b/i,
]

const DECLINED_PATTERNS = [
  /\bcan['']?t make it\b/i,
  /\bcan['']?t do it\b/i,
  /\bcan['']?t come\b/i,
  /\bwon['']?t be able\b/i,
  /\bi['']?m busy\b/i,
  /\brain ?check\b/i,
  /\bpass\b/i,
  /\bsorry\b/i,
  /\bgotta skip\b/i,
  /\bnext time\b/i,
  /\bsitting this one out\b/i,
  /\bnah\b/i,
  /\bnot this time\b/i,
  /\bno can do\b/i,
  /\bi['']?m out\b/i,
]

const MAYBE_PATTERNS = [
  /\bmaybe\b/i,
  /\blet me check\b/i,
  /\bi['']?ll try\b/i,
  /\bnot sure yet\b/i,
  /\btentative\b/i,
  /\bwe['']?ll see\b/i,
  /\bmight\b/i,
  /\bpossibly\b/i,
  /\bi['']?ll let you know\b/i,
  /\bget back to you\b/i,
]

/**
 * Classify a text message response as accepted/declined/maybe/unknown.
 */
export function classifyResponse(messageText: string): ResponseType {
  const text = messageText.trim()
  if (!text) return 'unknown'

  // Check declined first — "sorry" can appear in accepted contexts
  // but the overall sentiment of a decline is stronger
  for (const pattern of DECLINED_PATTERNS) {
    if (pattern.test(text)) return 'declined'
  }

  for (const ACCEPTED_PATTERN of ACCEPTED_PATTERNS) {
    if (ACCEPTED_PATTERN.test(text)) return 'accepted'
  }

  for (const pattern of MAYBE_PATTERNS) {
    if (pattern.test(text)) return 'maybe'
  }

  return 'unknown'
}

/**
 * Find an active plan that this contact is invited to,
 * with a target date within 7 days of the message date.
 */
export async function matchResponseToPlan(
  contactId: string,
  messageDate: string,
): Promise<{ planId: string; planType: string } | null> {
  const plans = await prisma.socialPlan.findMany({
    where: {
      status: { in: ['approved', 'sent'] },
    },
  })

  const msgDate = new Date(messageDate)

  for (const plan of plans) {
    const contacts = JSON.parse(plan.suggestedContacts || '[]') as Array<{
      contactId: string
    }>

    const isInvited = contacts.some(c => c.contactId === contactId)
    if (!isInvited) continue

    const planDate = new Date(plan.targetDate + 'T00:00:00')
    const daysDiff = Math.abs(
      (planDate.getTime() - msgDate.getTime()) / 86400000,
    )

    if (daysDiff <= 7) {
      return { planId: plan.id, planType: plan.planType }
    }
  }

  return null
}

/**
 * Process a response: classify, match to plan, update plan contacts.
 */
export async function processResponse(
  contactId: string,
  messageText: string,
  messageDate: string,
): Promise<{
  responseType: ResponseType
  matchedPlanId: string | null
} | null> {
  const responseType = classifyResponse(messageText)
  if (responseType === 'unknown') return null

  const match = await matchResponseToPlan(contactId, messageDate)
  if (!match) {
    return { responseType, matchedPlanId: null }
  }

  // Update the contact's response status in the plan
  const plan = await prisma.socialPlan.findUnique({
    where: { id: match.planId },
  })
  if (!plan) return { responseType, matchedPlanId: null }

  const contacts = JSON.parse(plan.suggestedContacts || '[]') as Array<{
    contactId: string
    responseStatus?: string
    respondedAt?: string
    [key: string]: unknown
  }>

  let updated = false
  for (const c of contacts) {
    if (c.contactId === contactId && !c.responseStatus) {
      c.responseStatus = responseType
      c.respondedAt = messageDate
      updated = true
      break
    }
  }

  if (updated) {
    await prisma.socialPlan.update({
      where: { id: match.planId },
      data: { suggestedContacts: JSON.stringify(contacts) },
    })
  }

  return { responseType, matchedPlanId: match.planId }
}

/**
 * Complete a plan — set status to completed and create attendee records.
 * (Replaces the old completePlanAsEvent which created a separate SocialEvent.)
 */
export async function completePlan(planId: string): Promise<boolean> {
  const plan = await prisma.socialPlan.findUnique({
    where: { id: planId },
  })
  if (!plan) return false

  const contacts = JSON.parse(plan.suggestedContacts || '[]') as Array<{
    contactId: string
    name: string
    responseStatus?: string
  }>

  // Create attendee records for accepted contacts (and those who didn't respond — assumed attended)
  const attendeeIds = contacts
    .filter(c => !c.responseStatus || c.responseStatus === 'accepted')
    .map(c => c.contactId)

  for (const contactId of attendeeIds) {
    await prisma.socialPlanAttendee.upsert({
      where: { planId_contactId: { planId, contactId } },
      create: { planId, contactId, status: 'attended' },
      update: { status: 'attended' },
    })
  }

  // Mark declined contacts
  const declinedIds = contacts
    .filter(c => c.responseStatus === 'declined')
    .map(c => c.contactId)

  for (const contactId of declinedIds) {
    await prisma.socialPlanAttendee.upsert({
      where: { planId_contactId: { planId, contactId } },
      create: { planId, contactId, status: 'declined' },
      update: { status: 'declined' },
    })
  }

  await prisma.socialPlan.update({
    where: { id: planId },
    data: {
      status: 'completed',
      completedAt: new Date().toISOString(),
    },
  })

  return true
}
