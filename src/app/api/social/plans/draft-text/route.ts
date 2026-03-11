import { NextRequest, NextResponse } from 'next/server'
import { generateDraftText, generateBatchDraftTexts } from '@/lib/draft-text'
import { sendBatchIMessages, sendIMessage } from '@/lib/imessage'
import { prisma } from '@/lib/db'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action, planId, contactId, planType, targetDate, venueName, hooks } = body

    // Batch generate drafts for a plan
    if (action === 'generate' && planId) {
      await generateBatchDraftTexts(planId)
      return NextResponse.json({ success: true, planId })
    }

    // Send all drafted messages for a plan via iMessage
    if (action === 'send' && planId) {
      const result = await sendBatchIMessages(planId)
      return NextResponse.json(result)
    }

    // Send a single drafted message for one contact in a plan
    if (action === 'send_one' && planId && contactId) {
      const plan = await prisma.socialPlan.findUnique({ where: { id: planId } })
      if (!plan) return NextResponse.json({ error: 'Plan not found' }, { status: 404 })

      const contacts = JSON.parse(plan.suggestedContacts || '[]') as Array<{
        contactId: string; name: string; phone: string | null
        draftText?: string; sentAt?: string; [key: string]: unknown
      }>

      const target = contacts.find(c => c.contactId === contactId)
      if (!target) return NextResponse.json({ error: 'Contact not in plan' }, { status: 404 })
      if (!target.draftText) return NextResponse.json({ error: 'No draft text for this contact' }, { status: 400 })

      // Look up phone if not in plan data
      let phone = target.phone
      if (!phone) {
        const contact = await prisma.contact.findUnique({
          where: { id: contactId },
          select: { phone: true },
        })
        phone = contact?.phone || null
      }

      if (!phone) return NextResponse.json({ error: `No phone number for ${target.name}` }, { status: 400 })

      const result = await sendIMessage(phone, target.draftText)

      if (result.success) {
        target.sentAt = new Date().toISOString()
        await prisma.socialPlan.update({
          where: { id: planId },
          data: { suggestedContacts: JSON.stringify(contacts) },
        })
      }

      return NextResponse.json({
        success: result.success,
        sentTo: target.name,
        error: result.error,
      })
    }

    // Single draft for preview
    if (contactId && planType) {
      const result = await generateDraftText({
        contactId,
        planType,
        targetDate,
        venueName,
        hooks: hooks || [],
      })
      return NextResponse.json(result)
    }

    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  } catch (error) {
    console.error('[DraftText] POST error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
