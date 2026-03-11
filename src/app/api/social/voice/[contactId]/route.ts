import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ contactId: string }> }
) {
  try {
    const { contactId } = await params

    // Get the contact's comm stats for sent count
    const commStats = await prisma.textContactCommStats.findFirst({
      where: { contactId },
      select: { messagesSent: true },
    })
    const sentCount = commStats?.messagesSent ?? 0

    // Get the contact's info for archetype classification
    const contact = await prisma.contact.findUnique({
      where: { id: contactId },
      select: {
        contactType: true,
        personalRing: true,
        personalGroup: true,
        categories: true,
      },
    })

    if (!contact) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
    }

    // Determine archetype for this contact
    const categories = JSON.parse(contact.categories || '[]') as string[]
    const personalGroup = (contact.personalGroup || '').toLowerCase()
    let archetype: string | null = null

    if (personalGroup.includes('senate') || personalGroup.includes('hill') ||
        categories.some(c => c.toLowerCase().includes('senate') || c.toLowerCase().includes('hill'))) {
      archetype = 'senate_hill'
    } else if (categories.some(c => c.toLowerCase().includes('golf'))) {
      archetype = 'golf'
    } else if (['personal', 'both'].includes(contact.contactType || '') && contact.personalRing === 'close') {
      archetype = 'friend_close'
    } else if (['personal', 'both'].includes(contact.contactType || '') && ['regular', null, ''].includes(contact.personalRing ?? '')) {
      archetype = 'friend_regular'
    } else if (contact.contactType === 'professional') {
      archetype = 'professional'
    } else if (['new', 'outer'].includes(contact.personalRing || '') && sentCount < 10) {
      archetype = 'new_acquaintance'
    } else if (['personal', 'both'].includes(contact.contactType || '')) {
      archetype = 'friend_regular'
    } else {
      archetype = 'professional'
    }

    // Tier selection logic
    let profile = null
    let tier = 'none'
    let tierReason = ''

    // Try per_contact first (for contacts with 50+ sent)
    if (sentCount >= 50) {
      const perContact = await prisma.textVoiceProfile.findFirst({
        where: { scope: 'per_contact', contactId },
      })
      if (perContact) {
        profile = perContact
        tier = 'per_contact'
        tierReason = `Individual voice profile based on ${sentCount} sent messages`
      }
    }

    // Try archetype if no per_contact
    if (!profile && archetype) {
      const archetypeProfile = await prisma.textVoiceProfile.findFirst({
        where: { scope: 'archetype', archetype },
      })
      if (archetypeProfile) {
        profile = archetypeProfile
        tier = 'archetype'
        tierReason = `Group voice profile for "${archetype}" archetype`
      }
    }

    // Fallback
    if (!profile) {
      const fallbackProfile = await prisma.textVoiceProfile.findFirst({
        where: { scope: 'fallback' },
      })
      if (fallbackProfile) {
        profile = fallbackProfile
        tier = 'fallback'
        tierReason = 'Global baseline voice profile'
      }
    }

    if (!profile) {
      return NextResponse.json({
        profile: null,
        tier: 'none',
        tierReason: 'No voice profiles generated yet',
        archetype,
        sentMessageCount: sentCount,
      })
    }

    return NextResponse.json({
      profile: {
        id: profile.id,
        scope: profile.scope,
        formality: profile.formality,
        typicalLength: profile.typicalLength,
        humorLevel: profile.humorLevel,
        emojiUsage: profile.emojiUsage,
        signaturePhrases: JSON.parse(profile.signaturePhrases || '[]'),
        openerPatterns: JSON.parse(profile.openerPatterns || '[]'),
        signOffPatterns: JSON.parse(profile.signOffPatterns || '[]'),
        styleNotes: profile.styleNotes,
        sampleMessages: JSON.parse(profile.sampleMessages || '[]'),
        lastExtracted: profile.lastExtracted,
      },
      tier,
      tierReason,
      archetype,
      sentMessageCount: sentCount,
    })
  } catch (error) {
    console.error('Voice profile error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch voice profile' },
      { status: 500 }
    )
  }
}
