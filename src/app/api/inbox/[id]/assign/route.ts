/**
 * PATCH /api/inbox/[id]/assign
 *
 * Assigns an existing contact to an ingestion item, or creates a new
 * contact and assigns it. Used when the email parser couldn't auto-match
 * a contact (contactId is null).
 *
 * Body: { contactId: string } — link to existing contact
 *   OR: { createContact: { name, title?, organization?, email?, phone?, tier? } }
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    // Find the ingestion item
    const item = await prisma.ingestionItem.findUnique({
      where: { id },
      select: { id: true, contactId: true, status: true },
    })

    if (!item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 })
    }

    let contactId: string
    let contactName: string

    if (body.contactId) {
      // Link to existing contact
      const contact = await prisma.contact.findUnique({
        where: { id: body.contactId },
        select: { id: true, name: true, organization: true, tier: true },
      })

      if (!contact) {
        return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
      }

      contactId = contact.id
      contactName = contact.name
    } else if (body.createContact) {
      // Create new contact and link
      const { name, title, organization, email, phone, tier } = body.createContact

      if (!name?.trim()) {
        return NextResponse.json({ error: 'Contact name is required' }, { status: 400 })
      }

      const contact = await prisma.contact.create({
        data: {
          name: name.trim(),
          title: title || null,
          organization: organization || null,
          email: email || null,
          phone: phone || null,
          tier: tier || 2,
          categories: JSON.stringify([]),
          tags: JSON.stringify([]),
          status: 'active',
          targetCadenceDays: 60,
        },
      })

      contactId = contact.id
      contactName = contact.name

      console.log(`[Inbox] Created new contact: ${contactName} (${contactId})`)
    } else {
      return NextResponse.json(
        { error: 'Must provide contactId or createContact' },
        { status: 400 }
      )
    }

    // Update the ingestion item
    await prisma.ingestionItem.update({
      where: { id },
      data: { contactId },
    })

    console.log(`[Inbox] Assigned contact ${contactName} to item ${id}`)

    return NextResponse.json({
      success: true,
      contactId,
      contactName,
    })
  } catch (error) {
    console.error('[Inbox] Assign error:', error)
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
