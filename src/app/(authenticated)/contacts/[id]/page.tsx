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
      pretexts: { where: { used: false }, orderBy: { createdAt: 'desc' } },
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

  // Fetch latest dossier
  const latestDossier = await prisma.contactDossier.findFirst({
    where: { contactId: params.id },
    orderBy: { version: 'desc' },
    select: {
      id: true,
      version: true,
      content: true,
      updatedBy: true,
      createdAt: true,
    },
  })

  // Fetch standing offers for this contact
  const standingOffers = await prisma.standingOffer.findMany({
    where: { contactId: params.id, active: true },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      description: true,
      offeredBy: true,
      originalWords: true,
      createdAt: true,
    },
  })

  // Fetch provenance records — where this contact was discovered
  const provenanceAsDiscovered = await prisma.contactProvenance.findMany({
    where: { contactId: params.id },
    include: {
      sourceContact: { select: { id: true, name: true, organization: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  // Fetch provenance records — contacts this person led us to
  const provenanceAsSource = await prisma.contactProvenance.findMany({
    where: { sourceContactId: params.id },
    include: {
      contact: { select: { id: true, name: true, organization: true, title: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  // Fetch "Also at [Org]" contacts
  const alsoAtOrg = contact.organization
    ? await prisma.contact.findMany({
        where: {
          organization: contact.organization,
          id: { not: params.id },
        },
        select: { id: true, name: true, title: true, tier: true },
        take: 10,
      })
    : []

  // Fetch most recent meeting prep for this contact (today or yesterday)
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  const latestPrep = await prisma.meetingPrep.findFirst({
    where: {
      contactId: params.id,
      date: { gte: yesterday },
    },
    orderBy: { generatedAt: 'desc' },
  })

  // Personal data (for personal/both contacts)
  const contactType = (contact as Record<string, unknown>).contactType as string || 'professional'
  let personalData = null
  if (contactType === 'personal' || contactType === 'both') {
    const [interests, activities, groupMemberships, relAsA, relAsB, eventAttendances, lifeEventsData] = await Promise.all([
      prisma.personalInterest.findMany({ where: { contactId: params.id }, orderBy: { createdAt: 'desc' } }),
      prisma.personalActivity.findMany({ where: { contactId: params.id }, orderBy: { createdAt: 'desc' } }),
      prisma.personalGroupMember.findMany({ where: { contactId: params.id }, include: { group: true } }),
      prisma.friendRelationship.findMany({ where: { contactAId: params.id }, include: { contactB: { select: { id: true, name: true, photoUrl: true } } } }),
      prisma.friendRelationship.findMany({ where: { contactBId: params.id }, include: { contactA: { select: { id: true, name: true, photoUrl: true } } } }),
      prisma.socialPlanAttendee.findMany({ where: { contactId: params.id }, include: { plan: true }, orderBy: { createdAt: 'desc' }, take: 10 }),
      prisma.lifeEvent.findMany({ where: { contactId: params.id }, orderBy: { eventDate: 'desc' } }),
    ])
    personalData = {
      contactType,
      personalRing: (contact as Record<string, unknown>).personalRing as string | null,
      personalCadenceDays: (contact as Record<string, unknown>).personalCadenceDays as number | null,
      howWeMet: (contact as Record<string, unknown>).howWeMet as string | null,
      city: (contact as Record<string, unknown>).city as string | null,
      neighborhood: (contact as Record<string, unknown>).neighborhood as string | null,
      streetAddress: (contact as Record<string, unknown>).streetAddress as string | null,
      stateRegion: (contact as Record<string, unknown>).stateRegion as string | null,
      zipCode: (contact as Record<string, unknown>).zipCode as string | null,
      communicationPref: (contact as Record<string, unknown>).communicationPref as string | null,
      partnerName: (contact as Record<string, unknown>).partnerName as string | null,
      kids: (contact as Record<string, unknown>).kids as string | null,
      dietaryNotes: (contact as Record<string, unknown>).dietaryNotes as string | null,
      availabilityNotes: (contact as Record<string, unknown>).availabilityNotes as string | null,
      emotionalContext: (contact as Record<string, unknown>).emotionalContext as string | null,
      emotionalContextSet: (contact as Record<string, unknown>).emotionalContextSet as string | null,
      reciprocityPattern: (contact as Record<string, unknown>).reciprocityPattern as string | null,
      funnelStage: (contact as Record<string, unknown>).funnelStage as string | null,
      interests: interests.map(i => ({ id: i.id, interest: i.interest, confidence: i.confidence })),
      activities: activities.map(a => ({ id: a.id, activity: a.activity, frequency: a.frequency })),
      groups: groupMemberships.map(gm => ({ id: gm.group.id, name: gm.group.name })),
      friendRelationships: [
        ...relAsA.map(r => ({ id: r.id, contactId: r.contactB.id, contactName: r.contactB.name, type: r.relationshipType })),
        ...relAsB.map(r => ({ id: r.id, contactId: r.contactA.id, contactName: r.contactA.name, type: r.relationshipType })),
      ],
      socialEvents: eventAttendances.map(ea => ({
        id: ea.plan.id, title: ea.plan.title, date: ea.plan.targetDate, eventType: ea.plan.planType, status: ea.status,
      })),
      lifeEvents: lifeEventsData.map(le => ({
        id: le.id, description: le.description, eventDate: le.eventDate, recurring: le.recurring,
        eventType: (le as Record<string, unknown>).eventType as string || 'custom',
      })),
    }
  }

  // Communication stats from text ingestion
  const commStatsRaw = await prisma.textContactCommStats.findFirst({
    where: { contactId: params.id },
  })
  const commStats = commStatsRaw ? {
    totalMessages: commStatsRaw.totalMessages,
    messagesSent: commStatsRaw.messagesSent,
    messagesReceived: commStatsRaw.messagesReceived,
    firstMessageDate: commStatsRaw.firstMessageDate,
    lastMessageDate: commStatsRaw.lastMessageDate,
    avgMessagesPerWeek: commStatsRaw.avgMessagesPerWeek,
    last30DayCount: commStatsRaw.last30DayCount,
    last90DayCount: commStatsRaw.last90DayCount,
    reciprocityRatio: commStatsRaw.reciprocityRatio,
    responseLatencyAvg: commStatsRaw.responseLatencyAvg,
    trend: commStatsRaw.trend,
    droppedBall: commStatsRaw.droppedBall,
    droppedBallSince: commStatsRaw.droppedBallSince,
  } : null

  // Extraction profiles from AI analysis
  const extractionProfiles = await prisma.textExtractionProfile.findMany({
    where: { contactId: params.id },
  })
  const factualRow = extractionProfiles.find(p => p.extractionType === 'factual')
  const interpretiveRow = extractionProfiles.find(p => p.extractionType === 'interpretive')
  const pj = (v: string | null, d: unknown = null) => { try { return v ? JSON.parse(v) : d } catch { return d } }
  const extractionData = (factualRow || interpretiveRow) ? {
    factual: factualRow ? {
      interests: pj(factualRow.interests, []),
      activities: pj(factualRow.activities, []),
      lifeEvents: pj(factualRow.lifeEvents, []),
      locationSignals: pj(factualRow.locationSignals, {}),
      keyPeopleMentioned: pj(factualRow.keyPeopleMentioned, []),
      howWeMetSignal: factualRow.howWeMetSignal,
      typicalTopics: pj(factualRow.typicalTopics, []),
      availabilityPatterns: factualRow.availabilityPatterns,
      openThreads: pj(factualRow.openThreads, []),
      lastExtracted: factualRow.lastExtracted,
    } : null,
    interpretive: interpretiveRow ? {
      communicationStyle: interpretiveRow.communicationStyle,
      personalityRead: pj(interpretiveRow.personalityRead, null),
      emotionalAvailability: interpretiveRow.emotionalAvailability,
      humorStyle: interpretiveRow.humorStyle,
      reliabilitySignal: interpretiveRow.reliabilitySignal,
      whatTheyCareAbout: interpretiveRow.whatTheyCareAbout,
      howTheySeeYou: interpretiveRow.howTheySeeYou,
      relationshipArc: interpretiveRow.relationshipArc,
      warmthSignal: interpretiveRow.warmthSignal,
      initiationPattern: interpretiveRow.initiationPattern,
      workingStyle: interpretiveRow.workingStyle,
      strategicPriorities: interpretiveRow.strategicPriorities,
      whatTheyWantFromYou: interpretiveRow.whatTheyWantFromYou,
      summary: interpretiveRow.summary,
      preOutreachBrief: interpretiveRow.preOutreachBrief,
      lastExtracted: interpretiveRow.lastExtracted,
    } : null,
  } : null

  // Voice profile (tier selection: per_contact > archetype > fallback)
  let voiceProfileData: {
    profile: {
      formality: string
      typicalLength: string
      humorLevel: string
      emojiUsage: string
      signaturePhrases: string[]
      openerPatterns: string[]
      signOffPatterns: string[]
      styleNotes: string | null
      sampleMessages: string[]
    }
    tier: string
    tierReason: string
    archetype: string | null
    sentMessageCount: number
  } | null = null

  const sentCount = commStatsRaw?.messagesSent ?? 0
  if (sentCount > 0) {
    const vcType = (contact as Record<string, unknown>).contactType as string || 'professional'
    const vcRing = (contact as Record<string, unknown>).personalRing as string | null
    const vcGroup = ((contact as Record<string, unknown>).personalGroup as string || '').toLowerCase()
    const vcCats = JSON.parse(contact.categories || '[]') as string[]

    let vcArchetype: string | null = null
    if (vcGroup.includes('senate') || vcGroup.includes('hill') ||
        vcCats.some(c => c.toLowerCase().includes('senate') || c.toLowerCase().includes('hill'))) {
      vcArchetype = 'senate_hill'
    } else if (vcCats.some(c => c.toLowerCase().includes('golf'))) {
      vcArchetype = 'golf'
    } else if (['personal', 'both'].includes(vcType) && vcRing === 'close') {
      vcArchetype = 'friend_close'
    } else if (['personal', 'both'].includes(vcType)) {
      vcArchetype = 'friend_regular'
    } else {
      vcArchetype = 'professional'
    }

    let vp = null
    let vTier = 'none'
    let vReason = ''

    if (sentCount >= 50) {
      const pc = await prisma.textVoiceProfile.findFirst({ where: { scope: 'per_contact', contactId: params.id } })
      if (pc) {
        vp = pc; vTier = 'per_contact'; vReason = `Individual voice profile (${sentCount} sent msgs)`
      }
    }
    if (!vp && vcArchetype) {
      const ap = await prisma.textVoiceProfile.findFirst({ where: { scope: 'archetype', archetype: vcArchetype } })
      if (ap) {
        vp = ap; vTier = 'archetype'; vReason = `Group voice profile (${vcArchetype})`
      }
    }
    if (!vp) {
      const fb = await prisma.textVoiceProfile.findFirst({ where: { scope: 'fallback' } })
      if (fb) {
        vp = fb; vTier = 'fallback'; vReason = 'Global baseline voice profile'
      }
    }
    if (vp) {
      voiceProfileData = {
        profile: {
          formality: vp.formality,
          typicalLength: vp.typicalLength,
          humorLevel: vp.humorLevel,
          emojiUsage: vp.emojiUsage,
          signaturePhrases: pj(vp.signaturePhrases, []) as string[],
          openerPatterns: pj(vp.openerPatterns, []) as string[],
          signOffPatterns: pj(vp.signOffPatterns, []) as string[],
          styleNotes: vp.styleNotes,
          sampleMessages: pj(vp.sampleMessages, []) as string[],
        },
        tier: vTier,
        tierReason: vReason,
        archetype: vcArchetype,
        sentMessageCount: sentCount,
      }
    }
  }

  // Use the most recent contact date from either logged interactions or text messages
  const lastInteractionMs = contact.lastInteractionDate ? new Date(contact.lastInteractionDate).getTime() : 0
  const lastTextMs = commStatsRaw?.lastMessageDate ? new Date(commStatsRaw.lastMessageDate).getTime() : 0
  const lastContactMs = Math.max(lastInteractionMs, lastTextMs)
  const daysSinceContact = lastContactMs > 0
    ? Math.floor((Date.now() - lastContactMs) / (1000 * 60 * 60 * 24))
    : null

  const enriched = {
    ...contact,
    categories: JSON.parse(contact.categories || '[]') as string[],
    tags: JSON.parse(contact.tags || '[]') as string[],
    daysSinceInteraction: daysSinceContact,
    isOverdue: daysSinceContact === null || daysSinceContact > contact.targetCadenceDays,
    interactions: contact.interactions.map(i => ({
      ...i,
      commitments: JSON.parse(i.commitments || '[]'),
      newContactsMentioned: JSON.parse(i.newContactsMentioned || '[]'),
    })),
  }

  // Pathway: org contacts for org-entry mode
  let orgContacts: Array<{ id: string; name: string; title: string | null; status: string; relationshipStrength: number }> = []
  if ((contact as Record<string, unknown>).outreachMode === 'org-entry' && contact.organization) {
    const oc = await prisma.contact.findMany({
      where: {
        organization: contact.organization,
        id: { not: contact.id },
      },
      select: { id: true, name: true, title: true, status: true, relationshipStrength: true },
      orderBy: { relationshipStrength: 'desc' },
      take: 10,
    })
    orgContacts = oc
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
      dossier={latestDossier}
      standingOffers={standingOffers}
      provenanceAsDiscovered={provenanceAsDiscovered.map(p => ({
        id: p.id,
        type: p.type,
        sourceContactId: p.sourceContactId,
        sourceContactName: p.sourceContact.name,
        sourceContactOrg: p.sourceContact.organization,
        notes: p.notes,
        createdAt: p.createdAt,
      }))}
      provenanceAsSource={provenanceAsSource.map(p => ({
        id: p.id,
        type: p.type,
        contactId: p.contactId,
        contactName: p.contact.name,
        contactOrg: p.contact.organization,
        contactTitle: p.contact.title,
        createdAt: p.createdAt,
      }))}
      alsoAtOrg={alsoAtOrg}
      personalData={personalData}
      commStats={commStats}
      extractionData={extractionData}
      voiceData={voiceProfileData}
    />
  )
}
