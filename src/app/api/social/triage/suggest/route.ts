import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// GET fuzzy match suggestions for a name against existing contacts
export async function GET(request: NextRequest) {
  try {
    const name = request.nextUrl.searchParams.get('name')
    if (!name) {
      return NextResponse.json({ error: 'name required' }, { status: 400 })
    }

    const nameLower = name.toLowerCase().trim()
    const nameParts = nameLower.split(/\s+/)

    // Get all contacts to match against
    const contacts = await prisma.contact.findMany({
      select: {
        id: true,
        name: true,
        title: true,
        organization: true,
        phone: true,
        contactType: true,
        personalRing: true,
      },
    })

    const matches = contacts
      .map((contact) => {
        const contactLower = contact.name.toLowerCase().trim()
        const contactParts = contactLower.split(/\s+/)

        // Exact match
        if (nameLower === contactLower) {
          return { ...contact, score: 1.0, matchType: 'exact' }
        }

        // Subset match (all parts of one appear in the other)
        const nameSet = new Set(nameParts)
        const contactSet = new Set(contactParts)
        const isSubset = [...nameSet].every((p) => contactSet.has(p))
        const isSuperset = [...contactSet].every((p) => nameSet.has(p))
        if (isSubset || isSuperset) {
          return { ...contact, score: 0.9, matchType: 'subset' }
        }

        // Partial overlap
        const shared = [...nameSet].filter((p) => contactSet.has(p))
        if (shared.length > 0) {
          const score = shared.length / Math.max(nameSet.size, contactSet.size)
          if (score >= 0.5) {
            return { ...contact, score, matchType: 'partial' }
          }
        }

        return null
      })
      .filter(Boolean)
      .sort((a, b) => b!.score - a!.score)
      .slice(0, 3)

    return NextResponse.json(matches)
  } catch (error) {
    console.error('[Triage Suggest] GET error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
