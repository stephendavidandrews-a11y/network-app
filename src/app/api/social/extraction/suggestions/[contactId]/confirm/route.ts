import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

const ALLOWED_FIELDS = ['city', 'neighborhood', 'stateRegion', 'howWeMet'] as const

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ contactId: string }> }
) {
  try {
    const { contactId } = await params
    const body = await request.json()
    const { field, value } = body

    if (!field || !value) {
      return NextResponse.json(
        { error: 'field and value are required' },
        { status: 400 }
      )
    }

    if (!ALLOWED_FIELDS.includes(field as typeof ALLOWED_FIELDS[number])) {
      return NextResponse.json(
        { error: `field must be one of: ${ALLOWED_FIELDS.join(', ')}` },
        { status: 400 }
      )
    }

    // Update the contact record
    await prisma.contact.update({
      where: { id: contactId },
      data: { [field]: value },
    })

    return NextResponse.json({ success: true, field, value })
  } catch (error) {
    console.error('[Suggestions] Confirm error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
