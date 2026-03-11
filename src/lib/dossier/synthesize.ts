/**
 * Contact Dossier Synthesis
 *
 * Generates a living intelligence document for a contact by
 * aggregating all interactions, commitments, signals, standing offers,
 * scheduling leads, and relationship notes into a narrative dossier.
 *
 * Two modes:
 * - incremental: Appends new intelligence to existing dossier
 * - full: Regenerates entire dossier from all historical data
 */

import { prisma } from '@/lib/db'
import { budgetedCreate, truncateForAPI } from '@/lib/api-budget'
interface SynthesizeResult {
  dossierId: string
  version: number
  contactId: string
  mode: 'incremental' | 'full'
}

export async function synthesizeDossier(
  contactId: string,
  mode: 'incremental' | 'full',
  newContext?: string
): Promise<SynthesizeResult> {
  // Fetch contact
  const contact = await prisma.contact.findUnique({
    where: { id: contactId },
    select: {
      id: true,
      name: true,
      title: true,
      organization: true,
      tier: true,
      email: true,
      phone: true,
      linkedinUrl: true,
      status: true,
      whyTheyMatter: true,
      notes: true,
      introductionPathway: true,
      connectionToHawleyOrbit: true,
      categories: true,
      tags: true,
      lastInteractionDate: true,
      targetCadenceDays: true,
      relationshipStrength: true,
      strategicValue: true,
    },
  })

  if (!contact) {
    throw new Error(`Contact not found: ${contactId}`)
  }

  // Fetch all interactions
  const interactions = await prisma.interaction.findMany({
    where: { contactId },
    orderBy: { date: 'desc' },
    take: 30,
    select: {
      id: true,
      type: true,
      date: true,
      summary: true,
      source: true,
      followUpRequired: true,
      followUpDescription: true,
      followUpCompleted: true,
      sentiment: true,
      relationshipDelta: true,
      relationshipNotes: true,
      topicsDiscussed: true,
    },
  })

  // Fetch commitments
  const commitments = await prisma.commitment.findMany({
    where: { contactId },
    orderBy: [{ fulfilled: 'asc' }, { dueDate: 'asc' }],
    select: {
      description: true,
      dueDate: true,
      fulfilled: true,
      fulfilledDate: true,
      fulfilledNotes: true,
    },
  })

  // Fetch signals
  const signals = await prisma.intelligenceSignal.findMany({
    where: { contactId },
    orderBy: { detectedAt: 'desc' },
    take: 15,
    select: {
      signalType: true,
      title: true,
      description: true,
      detectedAt: true,
      sourceName: true,
    },
  })

  // Fetch standing offers
  const offers = await prisma.standingOffer.findMany({
    where: { contactId },
    select: {
      description: true,
      offeredBy: true,
      originalWords: true,
      active: true,
      createdAt: true,
    },
  })

  // Fetch scheduling leads
  const schedulingLeads = await prisma.schedulingLead.findMany({
    where: { contactId },
    select: {
      description: true,
      timeframe: true,
      status: true,
      createdAt: true,
    },
  })

  // Fetch life events
  const lifeEvents = await prisma.lifeEvent.findMany({
    where: { contactId },
    orderBy: { createdAt: 'desc' },
    select: {
      description: true,
      person: true,
      eventDate: true,
      recurring: true,
    },
  })

  // Fetch referenced resources
  const resources = await prisma.referencedResource.findMany({
    where: { contactId },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: {
      description: true,
      resourceType: true,
      url: true,
      action: true,
    },
  })

  // Fetch relationships
  const relationships = await prisma.contactRelationship.findMany({
    where: {
      OR: [
        { contactAId: contactId },
        { contactBId: contactId },
      ],
    },
    select: {
      contactAId: true,
      contactBId: true,
      relationshipType: true,
      strength: true,
    },
  })

  const relatedContactIds = relationships.map(r =>
    r.contactAId === contactId ? r.contactBId : r.contactAId
  )
  const relatedContacts = relatedContactIds.length > 0
    ? await prisma.contact.findMany({
        where: { id: { in: relatedContactIds } },
        select: { id: true, name: true, organization: true, tier: true },
      })
    : []

  // Get existing dossier for incremental mode
  let existingDossier: string | null = null
  let currentVersion = 0

  if (mode === 'incremental') {
    const latest = await prisma.contactDossier.findFirst({
      where: { contactId },
      orderBy: { version: 'desc' },
      select: { content: true, version: true },
    })
    if (latest) {
      existingDossier = latest.content
      currentVersion = latest.version
    } else {
      // No existing dossier — fall back to full synthesis
      mode = 'full'
    }
  } else {
    const latest = await prisma.contactDossier.findFirst({
      where: { contactId },
      orderBy: { version: 'desc' },
      select: { version: true },
    })
    if (latest) {
      currentVersion = latest.version
    }
  }

  // Build the prompt
  const today = new Date().toISOString().split('T')[0]

  const contactSection = `## CONTACT PROFILE
Name: ${contact.name}
${contact.title ? `Title: ${contact.title}` : ''}
${contact.organization ? `Organization: ${contact.organization}` : ''}
Tier: ${contact.tier} (${contact.tier === 1 ? 'highest priority' : contact.tier === 2 ? 'medium priority' : 'lower priority'})
Status: ${contact.status}
${contact.email ? `Email: ${contact.email}` : ''}
${contact.whyTheyMatter ? `Why they matter: ${contact.whyTheyMatter}` : ''}
${contact.connectionToHawleyOrbit ? `Hawley connection: ${contact.connectionToHawleyOrbit}` : ''}
${contact.introductionPathway ? `Introduction pathway: ${contact.introductionPathway}` : ''}
${contact.notes ? `Notes: ${contact.notes}` : ''}
Relationship strength: ${contact.relationshipStrength}/10
Strategic value: ${contact.strategicValue}/10
Last interaction: ${contact.lastInteractionDate || 'never'}
Target cadence: every ${contact.targetCadenceDays} days`.trim()

  const interactionSection = interactions.length > 0
    ? `## INTERACTION HISTORY (${interactions.length} most recent)
${interactions.map(i => {
  let line = `- [${i.date}] ${i.type.replace(/_/g, ' ')}: ${i.summary || 'No summary'}`
  if (i.sentiment && i.sentiment !== 'neutral') line += ` [tone: ${i.sentiment}]`
  if (i.relationshipDelta && i.relationshipDelta !== 'maintained') line += ` [relationship: ${i.relationshipDelta}]`
  if (i.followUpRequired && !i.followUpCompleted) line += ' [FOLLOW-UP NEEDED]'
  const topics = i.topicsDiscussed ? JSON.parse(i.topicsDiscussed) : []
  if (topics.length > 0) line += `\n  Topics: ${topics.join(', ')}`
  if (i.relationshipNotes) line += `\n  Notes: ${i.relationshipNotes}`
  return line
}).join('\n')}`
    : '## INTERACTION HISTORY\nNo interactions logged.'

  const commitmentSection = commitments.length > 0
    ? `## COMMITMENTS
Open: ${commitments.filter(c => !c.fulfilled).map(c =>
  `- ${c.description}${c.dueDate ? ` (due: ${c.dueDate})` : ''}`
).join('\n') || 'None'}
Fulfilled: ${commitments.filter(c => c.fulfilled).map(c =>
  `- ${c.description}${c.fulfilledNotes ? ` — ${c.fulfilledNotes}` : ''}`
).join('\n') || 'None'}`
    : ''

  const signalSection = signals.length > 0
    ? `## INTELLIGENCE SIGNALS
${signals.map(s =>
  `- [${s.detectedAt?.split('T')[0] || 'unknown'}] ${s.signalType.replace(/_/g, ' ')}: ${s.title}${s.description ? ` — ${s.description}` : ''}`
).join('\n')}`
    : ''

  const offerSection = offers.length > 0
    ? `## STANDING OFFERS
${offers.map(o =>
  `- ${o.offeredBy === 'me' ? 'I offered' : 'They offered'}: ${o.description} ("${o.originalWords}")${!o.active ? ' [USED]' : ''}`
).join('\n')}`
    : ''

  const scheduleSection = schedulingLeads.length > 0
    ? `## SCHEDULING LEADS
${schedulingLeads.map(s =>
  `- ${s.description}${s.timeframe ? ` (${s.timeframe})` : ''} [${s.status}]`
).join('\n')}`
    : ''

  const lifeEventSection = lifeEvents.length > 0
    ? `## LIFE EVENTS & PERSONAL MILESTONES
${lifeEvents.map(le =>
  `- ${le.description} (${le.person})${le.eventDate ? ` — ${le.eventDate}` : ''}${le.recurring ? ' [recurring]' : ''}`
).join('\n')}`
    : ''

  const resourceSection = resources.length > 0
    ? `## REFERENCED RESOURCES
${resources.map(r =>
  `- [${r.resourceType}] ${r.description}${r.url ? ` (${r.url})` : ''}${r.action !== 'reference_only' ? ` [${r.action.replace(/_/g, ' ')}]` : ''}`
).join('\n')}`
    : ''

  const networkSection = relatedContacts.length > 0
    ? `## NETWORK CONNECTIONS
${relatedContacts.map(rc => {
  const rel = relationships.find(r =>
    (r.contactAId === contactId && r.contactBId === rc.id) ||
    (r.contactBId === contactId && r.contactAId === rc.id)
  )
  return `- ${rc.name} (${rc.organization || 'unknown org'}, T${rc.tier}) — ${rel?.relationshipType || 'connected'}`
}).join('\n')}`
    : ''

  let systemPrompt: string
  let userPrompt: string

  if (mode === 'incremental' && existingDossier) {
    systemPrompt = `You are an elite relationship intelligence system maintaining a living dossier for Stephen Andrews' contact: ${contact.name}.

Your task: UPDATE the existing dossier with new intelligence. Integrate the new information naturally into the existing narrative. Don't just append — weave it in where it belongs. Update any outdated information. Keep the same structure and tone.

The dossier is written in second person ("You met Jerry at...") as if briefing Stephen. It should read like a strategic intelligence document — substantive, actionable, with clear implications for the relationship.

Today's date: ${today}`

    userPrompt = `## EXISTING DOSSIER
${existingDossier}

## NEW INTELLIGENCE TO INTEGRATE
${newContext || 'No specific new context provided — refresh based on latest data below.'}

${contactSection}

${interactionSection}

${commitmentSection}

${signalSection}

${offerSection}

${scheduleSection}

${lifeEventSection}

${resourceSection}

${networkSection}

Update the dossier. Maintain the same sections but integrate any new information. If nothing has changed, return the existing dossier unchanged.`
  } else {
    systemPrompt = `You are an elite relationship intelligence system creating a comprehensive dossier for Stephen Andrews' contact: ${contact.name}.

Write a living intelligence document that captures everything Stephen needs to know about this person and this relationship. The dossier should be:

1. **Strategic** — Not just facts, but what they mean for the relationship
2. **Actionable** — Clear next steps, leverage points, unmet needs
3. **Personal** — Include personal details, rapport observations, personality insights
4. **Connected** — Show how this person connects to Stephen's broader network

Structure:
- **Profile & Context**: Who they are and why they matter to Stephen
- **Relationship Summary**: Current state of the relationship, trajectory, dynamics. Include sentiment patterns across interactions.
- **Key Intelligence**: What Stephen knows that's strategically valuable
- **Open Items**: Unfulfilled commitments, pending asks, scheduling leads
- **Standing Offers & Leverage Points**: Resources available through this relationship
- **Personal Notes**: Life events, family milestones, personal details that build rapport
- **Network Position**: How this person connects to others in Stephen's network
- **Resources & References**: Papers, articles, documents discussed or shared
- **Action Items & Recommendations**: What Stephen should do next

Write in second person ("You met Jerry at..."). Be substantive and specific — this is a strategic document, not a contact card.

Today's date: ${today}`

    userPrompt = `${contactSection}

${interactionSection}

${commitmentSection}

${signalSection}

${offerSection}

${scheduleSection}

${lifeEventSection}

${resourceSection}

${networkSection}

Generate the comprehensive dossier now. Be thorough — this is Stephen's primary reference document for this contact.`
  }

  const message = await budgetedCreate({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4000,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  }, 'dossier-synthesize')

  const dossierContent = message.content
    .filter(block => block.type === 'text')
    .map(block => (block as { type: 'text'; text: string }).text)
    .join('')

  const newVersion = currentVersion + 1

  // Write new dossier version
  const dossier = await prisma.contactDossier.create({
    data: {
      contactId,
      version: newVersion,
      content: dossierContent,
      updatedBy: mode,
    },
  })

  // Update contact's current dossier version
  await prisma.contact.update({
    where: { id: contactId },
    data: { dossierCurrentVersion: newVersion },
  })

  console.log(`[Dossier] ${mode} synthesis for ${contact.name} — version ${newVersion}`)

  return {
    dossierId: dossier.id,
    version: newVersion,
    contactId,
    mode,
  }
}
