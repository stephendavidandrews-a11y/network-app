import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  const contacts = await prisma.contact.findMany({
    select: {
      id: true,
      name: true,
      organization: true,
      tier: true,
      categories: true,
      relationshipStrength: true,
      strategicValue: true,
      status: true,
    },
  })

  const relationships = await prisma.contactRelationship.findMany({
    select: {
      contactAId: true,
      contactBId: true,
      relationshipType: true,
      strength: true,
    },
  })

  // Build nodes
  const nodes = contacts.map(c => {
    let categories: string[] = []
    try { categories = JSON.parse(c.categories || '[]') } catch { /* ignore */ }
    const primaryCategory = categories[0] || 'Uncategorized'

    return {
      id: c.id,
      name: c.name,
      organization: c.organization || '',
      tier: c.tier,
      category: primaryCategory,
      relationshipStrength: c.relationshipStrength,
      strategicValue: c.strategicValue,
      status: c.status,
      val: c.tier === 1 ? 8 : c.tier === 2 ? 5 : 3, // Node size
    }
  })

  // Build links from explicit relationships
  const links = relationships.map(r => ({
    source: r.contactAId,
    target: r.contactBId,
    type: r.relationshipType || 'connection',
    strength: r.strength,
  }))

  // Also create implicit links between contacts in the same organization
  const orgMap = new Map<string, string[]>()
  for (const c of contacts) {
    if (c.organization) {
      const org = c.organization.toLowerCase()
      if (!orgMap.has(org)) orgMap.set(org, [])
      orgMap.get(org)!.push(c.id)
    }
  }

  const existingLinks = new Set(links.map(l => `${l.source}|${l.target}`))
  for (const [, ids] of Array.from(orgMap.entries())) {
    if (ids.length < 2 || ids.length > 10) continue // Skip single or very large orgs
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const key1 = `${ids[i]}|${ids[j]}`
        const key2 = `${ids[j]}|${ids[i]}`
        if (!existingLinks.has(key1) && !existingLinks.has(key2)) {
          links.push({
            source: ids[i],
            target: ids[j],
            type: 'same_org',
            strength: 2,
          })
          existingLinks.add(key1)
        }
      }
    }
  }

  return NextResponse.json({ nodes, links })
}
