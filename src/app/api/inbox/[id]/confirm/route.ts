/**
 * POST /api/inbox/[id]/confirm
 *
 * Confirms an ingestion item, writing ALL extracted data to the real database.
 * Tracks a manifest of everything created for atomic undo.
 *
 * What gets stored on confirm:
 * - Interaction record (with sentiment, topics, relationshipDelta, relationshipNotes)
 * - Commitments (mine + theirs)
 * - Intelligence signals (org intel + status changes)
 * - Standing offers
 * - Scheduling leads
 * - Life events
 * - Referenced resources
 * - New contact stubs (tier 3)
 * - Observed connections / relationships
 * - Contact enrichment (title, org, phone, email from signature/extraction)
 * - Dossier synthesis with full context (not just summary)
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { synthesizeDossier } from '@/lib/dossier/synthesize'
import type { IngestionExtraction, ConfirmManifest } from '@/types'

export const dynamic = 'force-dynamic'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Optionally accept an edited extraction and/or provenance annotation
    let editedExtraction: IngestionExtraction | null = null
    let provenanceAnnotation: { type: string; sourceContactId: string; eventId?: string; sourceInteractionId?: string; notes?: string } | null = null
    try {
      const body = await request.json()
      if (body.extraction) {
        editedExtraction = body.extraction as IngestionExtraction
      }
      if (body.provenance) {
        provenanceAnnotation = body.provenance
      }
    } catch {
      // No body — use stored extraction
    }

    const item = await prisma.ingestionItem.findUnique({
      where: { id },
      include: {
        contact: { select: { id: true, name: true, title: true, organization: true, email: true, phone: true } },
      },
    })

    if (!item) {
      return NextResponse.json({ error: 'Ingestion item not found' }, { status: 404 })
    }

    if (item.status === 'confirmed' || item.status === 'edited') {
      return NextResponse.json({ error: 'Item already confirmed' }, { status: 400 })
    }

    const rawExtraction: IngestionExtraction = editedExtraction || JSON.parse(item.extraction)

    // Defensive: normalize all arrays so .map()/.length never crash on null/undefined
    const extraction: IngestionExtraction = {
      ...rawExtraction,
      myCommitments: rawExtraction.myCommitments || [],
      theirCommitments: rawExtraction.theirCommitments || [],
      asks: rawExtraction.asks || [],
      offers: rawExtraction.offers || [],
      newContactsMentioned: rawExtraction.newContactsMentioned || [],
      existingContactsMentioned: rawExtraction.existingContactsMentioned || [],
      observedConnections: rawExtraction.observedConnections || [],
      calendarEvents: rawExtraction.calendarEvents || [],
      schedulingLeads: rawExtraction.schedulingLeads || [],
      orgIntelligence: rawExtraction.orgIntelligence || [],
      statusChanges: rawExtraction.statusChanges || [],
      topicsDiscussed: rawExtraction.topicsDiscussed || [],
      lifeEvents: rawExtraction.lifeEvents || [],
      referencedResources: rawExtraction.referencedResources || [],
    }

    const { manifest, finalStatus } = await prisma.$transaction(async (tx) => {
      const manifest: ConfirmManifest = {}
      const now = new Date().toISOString()

      // ── 1. Create Interaction ──
      // An email, voice note, or iMessage IS an interaction regardless of Claude's classification.
      // Only skip interaction creation for pure intelligence_signal items from non-direct sources
      // and items classified as "irrelevant".
      const shouldCreateInteraction = item.contactId && (
        extraction.itemType !== 'irrelevant' && (
          extraction.itemType === 'interaction' ||
          extraction.itemType === 'scheduling' ||
          item.source === 'email' ||
          item.source === 'voice' ||
          item.source === 'imessage_auto'
        )
      )

      console.log(`[Inbox] Item ${id}: source=${item.source}, itemType=${extraction.itemType}, contactId=${item.contactId}, shouldCreateInteraction=${!!shouldCreateInteraction}`)

      if (shouldCreateInteraction && item.contactId) {
        const interactionType = resolveInteractionType(item.source, item.rawContent)
        const interactionDate = resolveInteractionDate(item)
        console.log(`[Inbox] Creating interaction: type=${interactionType}, date=${interactionDate}`)

        // Build legacy commitments JSON for backward compat
        const legacyCommitments = extraction.myCommitments.map(c => ({
          description: c.description,
          due_date: c.resolvedDate,
          fulfilled: false,
          fulfilled_date: null,
        }))

        const newContactsMentioned = extraction.newContactsMentioned.map(nc => ({
          name: nc.name,
          organization: nc.org,
          context: nc.context,
        }))

        const interaction = await tx.interaction.create({
          data: {
            contactId: item.contactId,
            type: interactionType,
            date: interactionDate,
            summary: extraction.summary,
            commitments: JSON.stringify(legacyCommitments),
            newContactsMentioned: JSON.stringify(newContactsMentioned),
            followUpRequired: extraction.asks.length > 0,
            followUpDescription: extraction.asks.length > 0
              ? extraction.asks.map(a => `[${a.direction === 'from_me' ? 'I asked' : 'They asked'}] ${a.description}`).join('; ')
              : null,
            // Relationship intelligence fields
            sentiment: extraction.sentiment,
            relationshipDelta: extraction.relationshipDelta,
            relationshipNotes: extraction.relationshipNotes || null,
            topicsDiscussed: JSON.stringify(extraction.topicsDiscussed),
            source: item.source === 'voice' ? 'voice_debrief' : item.source === 'email' ? 'email_parsed' : 'system',
            sourceIngestionId: item.id,
          },
        })
        manifest.interactionId = interaction.id

        // ── 2. Create Commitments ──
        const commitmentIds: string[] = []

        for (const c of extraction.myCommitments) {
          const commitment = await tx.commitment.create({
            data: {
              interactionId: interaction.id,
              contactId: item.contactId,
              description: `[Mine] ${c.description}`,
              dueDate: c.resolvedDate,
            },
          })
          commitmentIds.push(commitment.id)
        }

        for (const c of extraction.theirCommitments) {
          const commitment = await tx.commitment.create({
            data: {
              interactionId: interaction.id,
              contactId: item.contactId,
              description: `[Theirs] ${c.description}`,
              dueDate: c.resolvedDate,
            },
          })
          commitmentIds.push(commitment.id)
        }

        if (commitmentIds.length > 0) {
          manifest.commitmentIds = commitmentIds
        }
      }

      // ── 2b. Update lastInteractionDate and status ──
      // Always update for any confirmed item with a contact (not just interaction-type)
      if (item.contactId && extraction.itemType !== 'irrelevant') {
        const interactionDate = resolveInteractionDate(item)
        console.log(`[Inbox] Updating lastInteractionDate for contact ${item.contactId} → ${interactionDate}`)
        const currentContact = await tx.contact.findUnique({
          where: { id: item.contactId },
          select: { status: true, lastInteractionDate: true },
        })
        if (currentContact) {
          const contactUpdates: Record<string, string> = { lastInteractionDate: interactionDate }

          // Auto-advance status on any real correspondence
          const currentStatus = currentContact.status
          if (currentStatus === 'target' || currentStatus === 'outreach_sent') {
            contactUpdates.status = 'active'
          }
          if (currentStatus === 'cold' || currentStatus === 'dormant') {
            contactUpdates.status = 'warm'
          }

          await tx.contact.update({
            where: { id: item.contactId },
            data: contactUpdates,
          })
        }
      }

      // ── 3. Create Intelligence Signals ──
      if (item.contactId) {
        const signalIds: string[] = []

        if (extraction.orgIntelligence.length > 0) {
          for (const intel of extraction.orgIntelligence) {
            const signal = await tx.intelligenceSignal.create({
              data: {
                contactId: item.contactId,
                signalType: 'other',
                title: `${intel.organization}: ${intel.intelligence.slice(0, 100)}`,
                description: intel.intelligence,
                sourceName: intel.source,
                sourceIngestionId: item.id,
              },
            })
            signalIds.push(signal.id)
          }
        }

        // Status changes also create signals
        for (const sc of extraction.statusChanges) {
          const signal = await tx.intelligenceSignal.create({
            data: {
              contactId: item.contactId,
              signalType: sc.changeType === 'job_change' ? 'job_change' : 'other',
              title: sc.description.slice(0, 200),
              description: `${sc.from ? `From: ${sc.from}` : ''} ${sc.to ? `To: ${sc.to}` : ''} — ${sc.description}`,
              sourceIngestionId: item.id,
            },
          })
          signalIds.push(signal.id)
        }

        if (signalIds.length > 0) {
          manifest.signalIds = signalIds
        }
      }

      // ── 4. Create Standing Offers ──
      if (extraction.offers.length > 0 && item.contactId) {
        const offerIds: string[] = []

        for (const offer of extraction.offers) {
          const created = await tx.standingOffer.create({
            data: {
              contactId: item.contactId,
              description: offer.description,
              offeredBy: offer.offeredBy,
              originalWords: offer.originalWords,
              sourceIngestionId: item.id,
            },
          })
          offerIds.push(created.id)
        }

        manifest.standingOfferIds = offerIds
      }

      // ── 5. Create Scheduling Leads ──
      if (extraction.schedulingLeads.length > 0 && item.contactId) {
        const leadIds: string[] = []

        for (const lead of extraction.schedulingLeads) {
          const created = await tx.schedulingLead.create({
            data: {
              contactId: item.contactId,
              description: lead.description,
              originalWords: lead.originalWords,
              timeframe: lead.timeframe,
              sourceIngestionId: item.id,
            },
          })
          leadIds.push(created.id)
        }

        manifest.schedulingLeadIds = leadIds
      }

      // ── 6. Create Life Events ──
      if (extraction.lifeEvents.length > 0 && item.contactId) {
        const lifeEventIds: string[] = []

        for (const le of extraction.lifeEvents) {
          if (!le.description || le.description.trim().length < 3) continue

          const created = await tx.lifeEvent.create({
            data: {
              contactId: item.contactId,
              description: le.description,
              person: le.person,
              eventDate: le.date,
              recurring: le.recurring,
              sourceIngestionId: item.id,
            },
          })
          lifeEventIds.push(created.id)
        }

        if (lifeEventIds.length > 0) {
          manifest.lifeEventIds = lifeEventIds
        }
      }

      // ── 7. Create Referenced Resources ──
      if (extraction.referencedResources.length > 0) {
        const resourceIds: string[] = []

        for (const res of extraction.referencedResources) {
          if (!res.description || res.description.trim().length < 3) continue

          const created = await tx.referencedResource.create({
            data: {
              contactId: item.contactId,
              description: res.description,
              resourceType: res.type,
              url: res.url,
              action: res.action,
              sourceIngestionId: item.id,
            },
          })
          resourceIds.push(created.id)
        }

        if (resourceIds.length > 0) {
          manifest.referencedResourceIds = resourceIds
        }
      }

      // ── 8. Create New Contact Stubs ──
      if (extraction.newContactsMentioned.length > 0) {
        const contactIds: string[] = []

        for (const nc of extraction.newContactsMentioned) {
          if (!nc.name || nc.name.trim().length < 2) continue

          // Check if contact already exists (case-insensitive)
          const existing = await tx.contact.findFirst({
            where: { name: { equals: nc.name } },
            select: { id: true },
          })
          if (existing) continue

          const stub = await tx.contact.create({
            data: {
              name: nc.name,
              organization: nc.org,
              title: nc.title,
              email: nc.email,
              phone: nc.phone,
              tier: 3,
              status: 'mentioned',
              notes: nc.context,
              source: 'ingestion',
              discoveredVia: item.contact?.name || item.contactHint || 'ingestion',
            },
          })
          contactIds.push(stub.id)
        }

        if (contactIds.length > 0) {
          manifest.contactIds = contactIds
        }
      }

      // ── 9. Create Observed Connections ──
      if (extraction.observedConnections.length > 0) {
        const relationshipIds: string[] = []

        for (const conn of extraction.observedConnections) {
          // Find both contacts
          const contactA = await tx.contact.findFirst({
            where: { name: { contains: conn.person1 } },
            select: { id: true },
          })
          const contactB = await tx.contact.findFirst({
            where: { name: { contains: conn.person2 } },
            select: { id: true },
          })

          if (contactA && contactB && contactA.id !== contactB.id) {
            // Check if relationship already exists
            const existing = await tx.contactRelationship.findFirst({
              where: {
                OR: [
                  { contactAId: contactA.id, contactBId: contactB.id },
                  { contactAId: contactB.id, contactBId: contactA.id },
                ],
              },
            })

            if (existing) {
              // Increment observation count
              await tx.contactRelationship.update({
                where: { id: existing.id },
                data: {
                  observationCount: existing.observationCount + 1,
                  lastObserved: now,
                  observationSource: conn.source,
                },
              })
            } else {
              const strengthMap: Record<string, number> = {
                strong: 5,
                moderate: 3,
                weak: 2,
                unknown: 1,
              }

              const rel = await tx.contactRelationship.create({
                data: {
                  contactAId: contactA.id,
                  contactBId: contactB.id,
                  relationshipType: conn.nature,
                  strength: strengthMap[conn.strength] || 1,
                  source: 'inferred',
                  observationSource: conn.source,
                  lastObserved: now,
                },
              })
              relationshipIds.push(rel.id)
            }
          }
        }

        if (relationshipIds.length > 0) {
          manifest.relationshipIds = relationshipIds
        }
      }

      // ── 10. Contact Enrichment ──
      // Update the primary contact with any new information from extraction
      if (item.contactId && item.contact) {
        const contactUpdates: Record<string, string> = {}
        const fieldsUpdated: string[] = []

        // Enrich from status changes (job changes, promotions)
        for (const sc of extraction.statusChanges) {
          if (sc.to) {
            // If there's a "to" field, this might be a new title or org
            if (sc.changeType === 'job_change' || sc.changeType === 'promotion') {
              // Parse "to" — could be "Director at Treasury" or "New role"
              const toMatch = sc.to.match(/^(.+?)\s+(?:at|@)\s+(.+)$/i)
              if (toMatch) {
                if (!item.contact.title || item.contact.title !== toMatch[1]) {
                  contactUpdates.title = toMatch[1].trim()
                  fieldsUpdated.push('title')
                }
                if (!item.contact.organization || item.contact.organization !== toMatch[2]) {
                  contactUpdates.organization = toMatch[2].trim()
                  fieldsUpdated.push('organization')
                }
              } else if (sc.changeType === 'promotion') {
                // Just a title update
                if (!item.contact.title || item.contact.title !== sc.to) {
                  contactUpdates.title = sc.to
                  fieldsUpdated.push('title')
                }
              }
            }
            if (sc.changeType === 'org_change') {
              if (!item.contact.organization || item.contact.organization !== sc.to) {
                contactUpdates.organization = sc.to
                fieldsUpdated.push('organization')
              }
            }
          }
        }

        // Enrich from email metadata if available (signature parsing happened during ingestion)
        // The contact hint and raw content may contain enrichment data
        if (item.rawContent) {
          // Try to extract signature data from raw email
          const phonePattern = /(?:\+?1[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}/
          const emailPattern = /[\w.+-]+@[\w.-]+\.\w{2,}/

          // Only enrich if the contact is missing these fields
          if (!item.contact.phone) {
            // Look for phone in the raw content (signature area)
            const lines = item.rawContent.split('\n')
            const lastLines = lines.slice(-15) // Signature is usually at the end
            for (const line of lastLines) {
              const phoneMatch = line.match(phonePattern)
              if (phoneMatch) {
                contactUpdates.phone = phoneMatch[0]
                fieldsUpdated.push('phone')
                break
              }
            }
          }

          if (!item.contact.email && item.source === 'email') {
            // Try to get email from the raw content
            const lines = item.rawContent.split('\n')
            const lastLines = lines.slice(-15)
            for (const line of lastLines) {
              const emailMatch = line.match(emailPattern)
              if (emailMatch && !emailMatch[0].includes('stephenandrews')) {
                contactUpdates.email = emailMatch[0]
                fieldsUpdated.push('email')
                break
              }
            }
          }
        }

        // Apply contact updates if any
        if (Object.keys(contactUpdates).length > 0) {
          await tx.contact.update({
            where: { id: item.contactId },
            data: contactUpdates,
          })
          manifest.contactFieldsUpdated = fieldsUpdated
          console.log(`[Inbox] Enriched contact ${item.contact.name}: ${fieldsUpdated.join(', ')}`)
        }
      }

      // ── 11. Create Provenance Record ──
      if (provenanceAnnotation && item.contactId && provenanceAnnotation.sourceContactId) {
        try {
          // Upsert: update if this contact pair already has provenance
          const existing = await tx.contactProvenance.findUnique({
            where: {
              contactId_sourceContactId: {
                contactId: item.contactId,
                sourceContactId: provenanceAnnotation.sourceContactId,
              },
            },
          })

          if (existing) {
            await tx.contactProvenance.update({
              where: { id: existing.id },
              data: {
                type: provenanceAnnotation.type,
                notes: provenanceAnnotation.notes || existing.notes,
                sourceIngestionId: item.id,
              },
            })
            manifest.provenanceId = existing.id
          } else {
            const prov = await tx.contactProvenance.create({
              data: {
                contactId: item.contactId,
                sourceContactId: provenanceAnnotation.sourceContactId,
                type: provenanceAnnotation.type,
                eventId: provenanceAnnotation.eventId || null,
                sourceInteractionId: provenanceAnnotation.sourceInteractionId || manifest.interactionId || null,
                sourceIngestionId: item.id,
                notes: provenanceAnnotation.notes || null,
              },
            })
            manifest.provenanceId = prov.id
          }

          console.log(`[Inbox] Created provenance: ${item.contactId} <- ${provenanceAnnotation.sourceContactId} (${provenanceAnnotation.type})`)
        } catch (provError) {
          console.error('[Inbox] Provenance creation failed:', provError)
          // Non-fatal — don't block the confirm
        }
      }

      // ── Update Item Status ──
      const finalStatus = editedExtraction ? 'edited' : 'confirmed'
      await tx.ingestionItem.update({
        where: { id },
        data: {
          status: finalStatus,
          extraction: editedExtraction ? JSON.stringify(editedExtraction) : undefined,
          manifest: JSON.stringify(manifest),
          reviewedAt: now,
        },
      })

      // ── Log Learning Signal ──
      await tx.learningSignal.create({
        data: {
          ingestionItemId: id,
          action: editedExtraction ? 'edited' : 'confirmed',
          editDetails: editedExtraction ? JSON.stringify({ edited: true }) : null,
        },
      })
      return { manifest, finalStatus }
    }) // end transaction

    console.log(`[Inbox] Confirmed item ${id} | manifest: ${JSON.stringify(manifest)}`)

    // ── Trigger Dossier Update with Full Context ──
    if (item.contactId) {
      // Build rich context for dossier — not just the summary, but everything we extracted
      const dossierContext = buildDossierContext(extraction)
      synthesizeDossier(item.contactId, 'incremental', dossierContext).catch(err => {
        console.error(`[Dossier] Incremental update failed for contact ${item.contactId}:`, err)
      })
    }

    return NextResponse.json({
      success: true,
      manifest,
      status: finalStatus,
    })
  } catch (error) {
    console.error('[Inbox] Confirm error:', error)
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * Build a rich context string for dossier synthesis from the full extraction.
 * Instead of just passing the summary, we pass everything that's relationally meaningful.
 */
function buildDossierContext(extraction: IngestionExtraction): string {
  const parts: string[] = []

  // Summary
  parts.push(`## New Interaction Summary\n${extraction.summary}`)

  // Sentiment & relationship
  if (extraction.sentiment && extraction.sentiment !== 'neutral') {
    parts.push(`Interaction tone: ${extraction.sentiment}`)
  }
  if (extraction.relationshipDelta && extraction.relationshipDelta !== 'maintained') {
    parts.push(`Relationship trajectory: ${extraction.relationshipDelta}`)
  }
  if (extraction.relationshipNotes) {
    parts.push(`Relationship observations: ${extraction.relationshipNotes}`)
  }

  // Topics
  if (extraction.topicsDiscussed.length > 0) {
    parts.push(`Topics discussed: ${extraction.topicsDiscussed.join(', ')}`)
  }

  // Commitments
  if (extraction.myCommitments.length > 0) {
    parts.push(`My new commitments: ${extraction.myCommitments.map(c => c.description).join('; ')}`)
  }
  if (extraction.theirCommitments.length > 0) {
    parts.push(`Their new commitments: ${extraction.theirCommitments.map(c => c.description).join('; ')}`)
  }

  // Offers
  if (extraction.offers.length > 0) {
    parts.push(`Standing offers: ${extraction.offers.map(o => `${o.offeredBy === 'me' ? 'I offered' : 'They offered'}: ${o.description}`).join('; ')}`)
  }

  // Life events
  if (extraction.lifeEvents.length > 0) {
    parts.push(`Life events mentioned: ${extraction.lifeEvents.map(le => le.description).join('; ')}`)
  }

  // Org intelligence
  if (extraction.orgIntelligence.length > 0) {
    parts.push(`Org intel: ${extraction.orgIntelligence.map(o => `${o.organization}: ${o.intelligence}`).join('; ')}`)
  }

  // Status changes
  if (extraction.statusChanges.length > 0) {
    parts.push(`Status changes: ${extraction.statusChanges.map(sc => sc.description).join('; ')}`)
  }

  // New contacts mentioned
  if (extraction.newContactsMentioned.length > 0) {
    parts.push(`New people mentioned: ${extraction.newContactsMentioned.map(nc => `${nc.name}${nc.org ? ` (${nc.org})` : ''} — ${nc.context}`).join('; ')}`)
  }

  // Scheduling
  if (extraction.schedulingLeads.length > 0) {
    parts.push(`Scheduling: ${extraction.schedulingLeads.map(s => s.description).join('; ')}`)
  }

  return parts.join('\n\n')
}

/**
 * Determine the interaction type based on source and content.
 * For emails: distinguish sent vs received by checking if Stephen is the sender.
 * For voice: always a meeting/call debrief.
 */
function resolveInteractionType(source: string, rawContent: string): string {
  switch (source) {
    case 'email': {
      // Check if Stephen sent this email (it's in the "To" field of a forwarded message,
      // or the From contains stephenandrews)
      const fromMatch = rawContent.match(/From:\s*(.+)/i)
      if (fromMatch) {
        const from = fromMatch[1].toLowerCase()
        if (from.includes('stephenandrews') || from.includes('stephen andrews') || from.includes('stephen.andrews')) {
          return 'email_sent'
        }
      }
      return 'email_received'
    }
    case 'imessage_auto': return 'text_message'
    case 'voice': return 'meeting'  // Voice memos are debriefs of meetings/calls
    case 'ios_shortcut': return 'other'
    case 'signal_forward': return 'other'
    case 'manual': return 'other'
    default: return 'other'
  }
}

/**
 * Extract the actual date of the interaction from metadata.
 * For emails: try to find the Date header from the original email.
 * For everything else: use the ingestion item's creation timestamp.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function resolveInteractionDate(item: any): string {
  // Try to extract date from the raw email content (Date: header)
  if (item.source === 'email' && item.rawContent) {
    const dateMatch = item.rawContent.match(/Date:\s*(.+)/i)
    if (dateMatch) {
      try {
        const parsed = new Date(dateMatch[1].trim())
        if (!isNaN(parsed.getTime())) {
          return parsed.toISOString().split('T')[0]
        }
      } catch {
        // Fall through to default
      }
    }
  }

  // Default: use the ingestion item's createdAt
  const createdAt = typeof item.createdAt === 'string' ? item.createdAt : item.createdAt.toISOString()
  return createdAt.split('T')[0]
}
