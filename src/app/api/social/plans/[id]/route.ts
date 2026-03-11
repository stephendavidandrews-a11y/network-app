import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { completePlan } from '@/lib/response-tracker'
import { saveDraftCorrection } from '@/lib/draft-text'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  try {
    const plan = await prisma.socialPlan.findUnique({
      where: { id },
      include: {
        venue: { select: { id: true, name: true, venueType: true, city: true } },
        attendees: {
          include: { contact: { select: { id: true, name: true } } },
        },
      },
    })
    if (!plan) {
      return NextResponse.json({ error: 'Plan not found' }, { status: 404 })
    }
    return NextResponse.json({
      ...plan,
      suggestedContacts: JSON.parse(plan.suggestedContacts || '[]'),
      alternativeVenueIds: JSON.parse(plan.alternativeVenueIds || '[]'),
    })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  try {
    const body = await request.json()
    const { action } = body

    const plan = await prisma.socialPlan.findUnique({ where: { id } })
    if (!plan) {
      return NextResponse.json({ error: 'Plan not found' }, { status: 404 })
    }

    switch (action) {
      case 'approve': {
        const updated = await prisma.socialPlan.update({
          where: { id },
          data: { status: 'approved', approvedAt: new Date().toISOString() },
        })
        return NextResponse.json(updated)
      }

      case 'skip': {
        const updated = await prisma.socialPlan.update({
          where: { id },
          data: { status: 'skipped' },
        })
        return NextResponse.json(updated)
      }

      case 'postpone': {
        const { newDate } = body
        if (!newDate) {
          return NextResponse.json({ error: 'newDate required' }, { status: 400 })
        }
        const updated = await prisma.socialPlan.update({
          where: { id },
          data: { targetDate: newDate, status: 'pending' },
        })
        return NextResponse.json(updated)
      }

      case 'swap_contact': {
        const { removeContactId, addContactId } = body
        const contacts = JSON.parse(plan.suggestedContacts || '[]')
        const filtered = contacts.filter((c: { contactId: string }) => c.contactId !== removeContactId)

        if (addContactId) {
          const newContact = await prisma.contact.findUnique({
            where: { id: addContactId },
            select: { id: true, name: true, phone: true, personalRing: true, funnelStage: true },
          })
          if (newContact) {
            filtered.push({
              contactId: newContact.id,
              name: newContact.name,
              phone: newContact.phone,
              ring: newContact.personalRing || 'new',
              funnelStage: newContact.funnelStage,
              score: 0,
              reasoning: 'manually added',
              hooks: [],
            })
          }
        }

        const updated = await prisma.socialPlan.update({
          where: { id },
          data: { suggestedContacts: JSON.stringify(filtered), status: 'modified' },
        })
        return NextResponse.json({
          ...updated,
          suggestedContacts: JSON.parse(updated.suggestedContacts),
        })
      }

      case 'remove_contact': {
        const { contactId } = body
        const contacts = JSON.parse(plan.suggestedContacts || '[]')
        const filtered = contacts.filter((c: { contactId: string }) => c.contactId !== contactId)
        const updated = await prisma.socialPlan.update({
          where: { id },
          data: { suggestedContacts: JSON.stringify(filtered) },
        })
        return NextResponse.json({
          ...updated,
          suggestedContacts: JSON.parse(updated.suggestedContacts),
        })
      }

      case 'add_contact': {
        const { contactId } = body
        if (!contactId) {
          return NextResponse.json({ error: 'contactId required' }, { status: 400 })
        }
        const contact = await prisma.contact.findUnique({
          where: { id: contactId },
          select: { id: true, name: true, phone: true, personalRing: true, funnelStage: true },
        })
        if (!contact) {
          return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
        }
        const contacts = JSON.parse(plan.suggestedContacts || '[]')
        // Don't add duplicates
        if (contacts.some((c: { contactId: string }) => c.contactId === contactId)) {
          return NextResponse.json({ error: 'Contact already in plan' }, { status: 400 })
        }
        contacts.push({
          contactId: contact.id,
          name: contact.name,
          phone: contact.phone,
          ring: contact.personalRing || 'new',
          funnelStage: contact.funnelStage,
          score: 0,
          reasoning: 'manually added',
          hooks: [],
        })
        const updated = await prisma.socialPlan.update({
          where: { id },
          data: { suggestedContacts: JSON.stringify(contacts) },
        })
        return NextResponse.json({
          ...updated,
          suggestedContacts: JSON.parse(updated.suggestedContacts),
        })
      }

      case 'swap_venue': {
        const { venueId } = body
        const updated = await prisma.socialPlan.update({
          where: { id },
          data: { suggestedVenueId: venueId },
        })
        return NextResponse.json(updated)
      }

      case 'complete': {
        const success = await completePlan(id)
        if (!success) {
          return NextResponse.json({ error: 'Failed to complete plan' }, { status: 500 })
        }
        const updated = await prisma.socialPlan.findUnique({
          where: { id },
          include: { attendees: { include: { contact: { select: { id: true, name: true } } } } },
        })
        return NextResponse.json(updated)
      }

      case 'update_details': {
        const { title, time, notes, location, description, publicVisibility, coHosted } = body
        const data: Record<string, unknown> = {}
        if (title !== undefined) data.title = title
        if (time !== undefined) data.time = time
        if (notes !== undefined) data.notes = notes
        if (location !== undefined) data.location = location
        if (description !== undefined) data.description = description
        if (publicVisibility !== undefined) data.publicVisibility = publicVisibility
        if (coHosted !== undefined) data.coHosted = coHosted
        const updated = await prisma.socialPlan.update({
          where: { id },
          data,
        })
        return NextResponse.json(updated)
      }

      case 'update_draft_text': {
        const { contactId: draftContactId, draftText } = body
        if (!draftContactId || typeof draftText !== 'string') {
          return NextResponse.json({ error: 'contactId and draftText required' }, { status: 400 })
        }
        const draftContacts = JSON.parse(plan.suggestedContacts || '[]') as Array<{
          contactId: string
          draftText?: string
          voiceSource?: string
          [key: string]: unknown
        }>
        const targetContact = draftContacts.find(c => c.contactId === draftContactId)
        if (targetContact) {
          const originalDraft = targetContact.draftText || ''
          // Save correction for learning (only if text actually changed and there was an original)
          if (originalDraft && originalDraft !== draftText) {
            await saveDraftCorrection({
              contactId: draftContactId,
              purpose: plan.planType,
              originalDraft,
              editedDraft: draftText,
              voiceSource: targetContact.voiceSource || '',
            })
          }
          targetContact.draftText = draftText
        }
        const updatedDraftPlan = await prisma.socialPlan.update({
          where: { id },
          data: { suggestedContacts: JSON.stringify(draftContacts) },
        })
        return NextResponse.json({
          ...updatedDraftPlan,
          suggestedContacts: JSON.parse(updatedDraftPlan.suggestedContacts),
        })
      }

      case 'update_response': {
        const { contactId: respContactId, responseStatus } = body
        if (!respContactId || !responseStatus) {
          return NextResponse.json({ error: 'contactId and responseStatus required' }, { status: 400 })
        }
        const contacts = JSON.parse(plan.suggestedContacts || '[]') as Array<{
          contactId: string
          responseStatus?: string
          respondedAt?: string
          [key: string]: unknown
        }>
        for (const c of contacts) {
          if (c.contactId === respContactId) {
            c.responseStatus = responseStatus
            c.respondedAt = new Date().toISOString()
            break
          }
        }
        const updatedPlan = await prisma.socialPlan.update({
          where: { id },
          data: { suggestedContacts: JSON.stringify(contacts) },
        })
        return NextResponse.json({
          ...updatedPlan,
          suggestedContacts: JSON.parse(updatedPlan.suggestedContacts),
        })
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
    }
  } catch (error) {
    console.error('[Plans] PATCH error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  try {
    await prisma.socialPlan.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
