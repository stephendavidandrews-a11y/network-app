import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { sendEmail } from '@/lib/email'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const outreach = await prisma.outreachQueue.findUnique({
    where: { id: params.id },
    include: { contact: true },
  })

  if (!outreach) {
    return NextResponse.json({ error: 'Outreach item not found' }, { status: 404 })
  }

  if (!outreach.contact.email) {
    return NextResponse.json({ error: 'Contact has no email address' }, { status: 400 })
  }

  if (outreach.status !== 'approved') {
    return NextResponse.json({ error: 'Outreach must be approved before sending' }, { status: 400 })
  }

  const subject = outreach.draftSubject || 'Hello'
  const body = outreach.finalText || outreach.draftBody || ''

  const result = await sendEmail({
    to: outreach.contact.email,
    subject,
    body,
  })

  if (result.success) {
    await prisma.outreachQueue.update({
      where: { id: params.id },
      data: {
        status: 'sent',
        sentAt: new Date().toISOString(),
      },
    })

    // Log as an interaction
    await prisma.interaction.create({
      data: {
        contactId: outreach.contactId,
        type: 'email_sent',
        date: new Date().toISOString().split('T')[0],
        summary: `Outreach email: ${subject}`,
        source: 'system',
      },
    })

    // Update contact's last interaction date
    await prisma.contact.update({
      where: { id: outreach.contactId },
      data: {
        lastInteractionDate: new Date().toISOString().split('T')[0],
        status: outreach.contact.status === 'target' ? 'outreach_sent' : outreach.contact.status,
      },
    })

    return NextResponse.json({ success: true, messageId: result.messageId })
  } else {
    return NextResponse.json({ error: result.error || 'Send failed' }, { status: 500 })
  }
}
