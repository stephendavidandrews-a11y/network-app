import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

interface Edge {
  target: string
  type: string
  strength: number
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const from = searchParams.get('from')
  const to = searchParams.get('to')

  if (!from || !to) {
    return NextResponse.json({ error: 'from and to parameters required' }, { status: 400 })
  }

  const contacts = await prisma.contact.findMany({
    select: { id: true, name: true, organization: true, tier: true, lastInteractionDate: true },
  })

  const relationships = await prisma.contactRelationship.findMany({
    select: { contactAId: true, contactBId: true, relationshipType: true, strength: true },
  })

  // Build adjacency list
  const adj = new Map<string, Edge[]>()
  for (const c of contacts) {
    adj.set(c.id, [])
  }

  for (const r of relationships) {
    adj.get(r.contactAId)?.push({ target: r.contactBId, type: r.relationshipType || 'connection', strength: r.strength })
    adj.get(r.contactBId)?.push({ target: r.contactAId, type: r.relationshipType || 'connection', strength: r.strength })
  }

  // Add same-org edges
  const orgMap = new Map<string, string[]>()
  for (const c of contacts) {
    if (c.organization) {
      const org = c.organization.toLowerCase()
      if (!orgMap.has(org)) orgMap.set(org, [])
      orgMap.get(org)!.push(c.id)
    }
  }

  const existingEdges = new Set<string>()
  for (const r of relationships) {
    existingEdges.add(`${r.contactAId}|${r.contactBId}`)
    existingEdges.add(`${r.contactBId}|${r.contactAId}`)
  }

  for (const [, ids] of Array.from(orgMap.entries())) {
    if (ids.length < 2 || ids.length > 10) continue
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        if (!existingEdges.has(`${ids[i]}|${ids[j]}`)) {
          adj.get(ids[i])?.push({ target: ids[j], type: 'same_org', strength: 2 })
          adj.get(ids[j])?.push({ target: ids[i], type: 'same_org', strength: 2 })
          existingEdges.add(`${ids[i]}|${ids[j]}`)
          existingEdges.add(`${ids[j]}|${ids[i]}`)
        }
      }
    }
  }

  // BFS to find up to 3 shortest paths
  const paths = findShortestPaths(adj, from, to, 3)

  const contactMap = new Map(contacts.map(c => [c.id, c]))

  const result = paths.map(path => ({
    hops: path.length - 1,
    nodes: path.map(id => {
      const c = contactMap.get(id)
      return c ? { id: c.id, name: c.name, organization: c.organization, tier: c.tier, lastInteractionDate: c.lastInteractionDate } : null
    }).filter(Boolean),
    edges: path.slice(0, -1).map((id, i) => {
      const nextId = path[i + 1]
      const edge = adj.get(id)?.find(e => e.target === nextId)
      return { from: id, to: nextId, type: edge?.type || 'unknown', strength: edge?.strength || 1 }
    }),
  }))

  return NextResponse.json({ paths: result })
}

function findShortestPaths(adj: Map<string, Edge[]>, start: string, end: string, maxPaths: number): string[][] {
  if (start === end) return [[start]]

  const results: string[][] = []
  const queue: Array<{ node: string; path: string[] }> = [{ node: start, path: [start] }]
  let shortestLength = Infinity

  while (queue.length > 0 && results.length < maxPaths) {
    const { node, path } = queue.shift()!

    if (path.length > shortestLength + 1) break // Don't explore beyond shortest + 1

    const neighbors = adj.get(node) || []
    for (const edge of neighbors) {
      if (path.includes(edge.target)) continue // No cycles

      const newPath = [...path, edge.target]
      if (edge.target === end) {
        shortestLength = Math.min(shortestLength, newPath.length)
        results.push(newPath)
        if (results.length >= maxPaths) break
      } else if (newPath.length < shortestLength) {
        queue.push({ node: edge.target, path: newPath })
      }
    }
  }

  // Sort by total edge strength (higher = better path)
  return results.sort((a, b) => {
    const strengthA = a.slice(0, -1).reduce((sum, id, i) => {
      const edge = adj.get(id)?.find(e => e.target === a[i + 1])
      return sum + (edge?.strength || 1)
    }, 0)
    const strengthB = b.slice(0, -1).reduce((sum, id, i) => {
      const edge = adj.get(id)?.find(e => e.target === b[i + 1])
      return sum + (edge?.strength || 1)
    }, 0)
    return strengthB - strengthA
  })
}
