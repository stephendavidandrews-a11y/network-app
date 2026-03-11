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
    const profiles = await prisma.textExtractionProfile.findMany({
      where: { contactId },
    })

    const factualRow = profiles.find(p => p.extractionType === 'factual')
    const interpretiveRow = profiles.find(p => p.extractionType === 'interpretive')

    const factual = factualRow
      ? {
          interests: parseJson(factualRow.interests, []),
          activities: parseJson(factualRow.activities, []),
          lifeEvents: parseJson(factualRow.lifeEvents, []),
          locationSignals: parseJson(factualRow.locationSignals, {}),
          keyPeopleMentioned: parseJson(factualRow.keyPeopleMentioned, []),
          howWeMetSignal: factualRow.howWeMetSignal,
          typicalTopics: parseJson(factualRow.typicalTopics, []),
          availabilityPatterns: factualRow.availabilityPatterns,
          openThreads: parseJson(factualRow.openThreads, []),
          lastExtracted: factualRow.lastExtracted,
        }
      : null

    const interpretive = interpretiveRow
      ? {
          communicationStyle: interpretiveRow.communicationStyle,
          personalityRead: parseJson(interpretiveRow.personalityRead, null),
          emotionalAvailability: interpretiveRow.emotionalAvailability,
          humorStyle: interpretiveRow.humorStyle,
          reliabilitySignal: interpretiveRow.reliabilitySignal,
          whatTheyCareAbout: interpretiveRow.whatTheyCareAbout,
          howTheySeeYou: interpretiveRow.howTheySeeYou,
          relationshipArc: interpretiveRow.relationshipArc,
          warmthSignal: interpretiveRow.warmthSignal,
          initiationPattern: interpretiveRow.initiationPattern,
          workingStyle: interpretiveRow.workingStyle,
          strategicPriorities: interpretiveRow.strategicPriorities,
          whatTheyWantFromYou: interpretiveRow.whatTheyWantFromYou,
          summary: interpretiveRow.summary,
          preOutreachBrief: interpretiveRow.preOutreachBrief,
          lastExtracted: interpretiveRow.lastExtracted,
        }
      : null

    return NextResponse.json({ factual, interpretive })
  } catch (error) {
    console.error('[Extraction] GET error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
