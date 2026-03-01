import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { resultId, action, editedEmail } = body

    if (!resultId || !action) {
      return NextResponse.json({ error: 'resultId and action are required' }, { status: 400 })
    }

    if (!['approve', 'reject', 'edit_approve'].includes(action)) {
      return NextResponse.json({ error: 'action must be approve, reject, or edit_approve' }, { status: 400 })
    }

    const result = await prisma.enrichmentResult.findUnique({
      where: { id: resultId },
    })

    if (!result) {
      return NextResponse.json({ error: 'Enrichment result not found' }, { status: 404 })
    }

    const now = new Date().toISOString()

    if (action === 'reject') {
      await prisma.enrichmentResult.update({
        where: { id: resultId },
        data: { status: 'rejected', reviewedAt: now },
      })
      return NextResponse.json({ success: true, contactId: result.contactId })
    }

    // Approve or edit_approve
    const emailToWrite = action === 'edit_approve' ? editedEmail : result.email

    if (!emailToWrite) {
      return NextResponse.json({ error: 'No email to approve' }, { status: 400 })
    }

    // Check for duplicate email
    const existing = await prisma.contact.findFirst({
      where: {
        email: emailToWrite,
        id: { not: result.contactId },
      },
      select: { id: true, name: true },
    })

    if (existing) {
      return NextResponse.json({
        error: `Email ${emailToWrite} is already assigned to ${existing.name}`,
        duplicate: true,
        existingContactId: existing.id,
        existingContactName: existing.name,
      }, { status: 409 })
    }

    // Write email to contact and update enrichment result
    await prisma.$transaction([
      prisma.contact.update({
        where: { id: result.contactId },
        data: { email: emailToWrite },
      }),
      prisma.enrichmentResult.update({
        where: { id: resultId },
        data: {
          status: 'approved',
          email: emailToWrite,
          reviewedAt: now,
        },
      }),
    ])

    return NextResponse.json({
      success: true,
      contactId: result.contactId,
      email: emailToWrite,
    })
  } catch (error) {
    console.error('[Enrichment] Review error:', error)
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
