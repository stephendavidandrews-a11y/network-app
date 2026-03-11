import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// GET triage candidates — unmatched phone numbers with message stats
export async function GET(request: NextRequest) {
  try {
    const bucket = request.nextUrl.searchParams.get('bucket') || 'main'

    const minMessages = bucket === 'warm_leads' ? 3 : 20
    const maxMessages = bucket === 'warm_leads' ? 19 : undefined

    const where: Record<string, unknown> = {
      contactId: null,
      triageStatus: null,
      totalMessages: { gte: minMessages },
    }
    if (maxMessages) {
      where.totalMessages = { ...where.totalMessages as object, lte: maxMessages }
    }

    if (bucket === 'warm_leads') {
      const twelveMonthsAgo = new Date()
      twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12)
      const thirteenMonthsAgo = new Date()
      thirteenMonthsAgo.setMonth(thirteenMonthsAgo.getMonth() - 13)

      where.lastMessageDate = { gte: twelveMonthsAgo.toISOString() }
      where.firstMessageDate = { gte: thirteenMonthsAgo.toISOString() }
    }

    const candidates = await prisma.textContactCommStats.findMany({
      where,
      orderBy: { totalWeightedScore: 'desc' },
    })

    // For each candidate, get sample recent messages
    const enriched = await Promise.all(
      candidates.map(async (c) => {
        const recentMessages = await prisma.textMessage.findMany({
          where: { phoneNumber: c.phoneNumber, isGroupMessage: false },
          orderBy: { timestamp: 'desc' },
          take: 3,
          select: {
            direction: true,
            content: true,
            timestamp: true,
          },
        })

        return {
          ...c,
          recentMessages,
        }
      })
    )

    return NextResponse.json(enriched)
  } catch (error) {
    console.error('[Triage] GET error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

// Create Interaction records from text messages for a contact
async function createTextInteractions(contactId: string, phoneNumber: string) {
  // Group messages by date to create one interaction per day of texting
  const messages = await prisma.textMessage.findMany({
    where: { phoneNumber, isGroupMessage: false },
    orderBy: { timestamp: 'asc' },
    select: { timestamp: true, direction: true, content: true },
  })

  if (messages.length === 0) return

  // Group by date
  const byDate = new Map<string, typeof messages>()
  for (const m of messages) {
    const date = m.timestamp.split('T')[0]
    if (!byDate.has(date)) byDate.set(date, [])
    byDate.get(date)!.push(m)
  }

  // Create interaction for each day (batch — limit to most recent 30 days of texting)
  const dates = Array.from(byDate.keys()).slice(-30)
  for (const date of dates) {
    const dayMsgs = byDate.get(date)!
    const sent = dayMsgs.filter(m => m.direction === 'sent').length
    const received = dayMsgs.filter(m => m.direction === 'received').length

    // Check if interaction already exists for this contact+date+type
    const existing = await prisma.interaction.findFirst({
      where: { contactId, date, type: 'text' },
    })
    if (existing) continue

    await prisma.interaction.create({
      data: {
        contactId,
        type: 'text',
        date,
        summary: `Text exchange: ${sent} sent, ${received} received`,
        source: 'text_ingestion',
      },
    })
  }

  // Update lastInteractionDate on the contact
  const lastDate = dates[dates.length - 1]
  if (lastDate) {
    const contact = await prisma.contact.findUnique({ where: { id: contactId } })
    if (contact && (!contact.lastInteractionDate || contact.lastInteractionDate < lastDate)) {
      await prisma.contact.update({
        where: { id: contactId },
        data: { lastInteractionDate: lastDate },
      })
    }
  }
}

// POST — classify a triage candidate
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { phoneNumber, action, contactType, contactId, name } = body

    if (!phoneNumber || !action) {
      return NextResponse.json(
        { error: 'phoneNumber and action required' },
        { status: 400 }
      )
    }

    if (action === 'match' && contactId) {
      // Link to existing contact
      await prisma.textContactCommStats.updateMany({
        where: { phoneNumber },
        data: { contactId },
      })
      await prisma.textMessage.updateMany({
        where: { phoneNumber, contactId: null },
        data: { contactId },
      })

      // Update contact phone if missing + contactType if provided
      const contact = await prisma.contact.findUnique({ where: { id: contactId } })
      const updateData: Record<string, string> = {}
      if (contact && !contact.phone) updateData.phone = phoneNumber
      if (contactType) updateData.contactType = contactType
      if (Object.keys(updateData).length > 0) {
        await prisma.contact.update({
          where: { id: contactId },
          data: updateData,
        })
      }

      // Create text interactions for the matched contact
      await createTextInteractions(contactId, phoneNumber)

      return NextResponse.json({ success: true, action: 'matched', contactId })
    }

    if (action === 'create') {
      // Create new contact
      if (!name) {
        return NextResponse.json({ error: 'name required for create' }, { status: 400 })
      }

      const newContact = await prisma.contact.create({
        data: {
          name,
          phone: phoneNumber,
          contactType: contactType || 'personal',
          tier: 3,
          status: 'active',
          source: 'text_ingestion',
          personalRing: 'outer',
        },
      })

      // Link stats and messages
      await prisma.textContactCommStats.updateMany({
        where: { phoneNumber },
        data: { contactId: newContact.id },
      })
      await prisma.textMessage.updateMany({
        where: { phoneNumber, contactId: null },
        data: { contactId: newContact.id },
      })

      // Create text interactions for the new contact
      await createTextInteractions(newContact.id, phoneNumber)

      return NextResponse.json({ success: true, action: 'created', contactId: newContact.id })
    }

    if (action === 'dismiss') {
      await prisma.textContactCommStats.updateMany({
        where: { phoneNumber },
        data: { triageStatus: 'dismissed' },
      })
      return NextResponse.json({ success: true, action: 'dismissed' })
    }

    if (action === 'defer') {
      await prisma.textContactCommStats.updateMany({
        where: { phoneNumber },
        data: { triageStatus: 'deferred' },
      })
      return NextResponse.json({ success: true, action: 'deferred' })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (error) {
    console.error('[Triage] POST error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
