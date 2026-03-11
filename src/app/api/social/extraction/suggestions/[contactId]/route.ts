import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

function parseJson(value: string | null, fallback: unknown = null) {
  if (!value) return fallback
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ contactId: string }> }
) {
  try {
    const { contactId } = await params

    // Get the factual profile
    const profile = await prisma.textExtractionProfile.findFirst({
      where: { contactId, extractionType: 'factual' },
    })

    if (!profile) {
      return NextResponse.json([])
    }

    // Get the contact to check which fields are empty
    const contact = await prisma.contact.findUnique({
      where: { id: contactId },
    })

    if (!contact) {
      return NextResponse.json([])
    }

    const suggestions: Array<{
      field: string
      label: string
      suggestedValue: string
      confidence: string
      source: string
    }> = []

    // Location suggestions — only for fields the contact doesn't have
    const locationSignals = parseJson(profile.locationSignals, {}) as Record<string, { value: string | null; confidence: string }>

    if (locationSignals.city?.value && !contact.city) {
      suggestions.push({
        field: 'city',
        label: 'City',
        suggestedValue: locationSignals.city.value,
        confidence: locationSignals.city.confidence,
        source: 'text_extraction',
      })
    }

    if (locationSignals.neighborhood?.value && !contact.neighborhood) {
      suggestions.push({
        field: 'neighborhood',
        label: 'Neighborhood',
        suggestedValue: locationSignals.neighborhood.value,
        confidence: locationSignals.neighborhood.confidence,
        source: 'text_extraction',
      })
    }

    if (locationSignals.stateRegion?.value && !contact.stateRegion) {
      suggestions.push({
        field: 'stateRegion',
        label: 'State/Region',
        suggestedValue: locationSignals.stateRegion.value,
        confidence: locationSignals.stateRegion.confidence,
        source: 'text_extraction',
      })
    }

    // How we met suggestion
    if (profile.howWeMetSignal && !contact.howWeMet) {
      suggestions.push({
        field: 'howWeMet',
        label: 'How you met',
        suggestedValue: profile.howWeMetSignal,
        confidence: 'medium',
        source: 'text_extraction',
      })
    }

    return NextResponse.json(suggestions)
  } catch (error) {
    console.error('[Suggestions] GET error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
