/**
 * Compute PersonalGroup suggestions from group chat co-occurrence patterns.
 *
 * Finds clusters of contacts who frequently appear together in the same
 * group chats and suggests PersonalGroup creation.
 */

import { prisma } from './db'

interface GroupSuggestion {
  memberIds: string[]
  memberNames: string[]
  suggestedName: string
  sharedChatCount: number
}

/**
 * Simple union-find for clustering contact pairs.
 */
class UnionFind {
  private parent: Map<string, string> = new Map()

  find(x: string): string {
    if (!this.parent.has(x)) this.parent.set(x, x)
    if (this.parent.get(x) !== x) {
      this.parent.set(x, this.find(this.parent.get(x)!))
    }
    return this.parent.get(x)!
  }

  union(a: string, b: string): void {
    const ra = this.find(a)
    const rb = this.find(b)
    if (ra !== rb) this.parent.set(ra, rb)
  }

  clusters(): Map<string, string[]> {
    const groups = new Map<string, string[]>()
    for (const key of this.parent.keys()) {
      const root = this.find(key)
      if (!groups.has(root)) groups.set(root, [])
      groups.get(root)!.push(key)
    }
    return groups
  }
}

export async function computeGroupSuggestions(): Promise<GroupSuggestion[]> {
  // Get co-occurrence pairs (contacts who share 2+ group chats)
  const pairs = await prisma.$queryRawUnsafe<
    Array<{ contact_a: string; contact_b: string; shared_chats: number }>
  >(`
    SELECT a.contact_id as contact_a, b.contact_id as contact_b, CAST(COUNT(*) AS INTEGER) as shared_chats
    FROM text_group_chat_members a
    JOIN text_group_chat_members b
      ON a.group_chat_id = b.group_chat_id AND a.contact_id < b.contact_id
    WHERE a.contact_id IS NOT NULL AND b.contact_id IS NOT NULL
    GROUP BY a.contact_id, b.contact_id
    HAVING COUNT(*) >= 2
  `)

  // Convert BigInt fields from raw query to Number
  const normalizedPairs = pairs.map(p => ({
    ...p,
    shared_chats: Number(p.shared_chats),
  }))

  if (normalizedPairs.length === 0) return []

  // Filter to personal/both contacts only
  const allContactIds = new Set<string>()
  for (const p of normalizedPairs) {
    allContactIds.add(p.contact_a)
    allContactIds.add(p.contact_b)
  }

  const personalContacts = await prisma.contact.findMany({
    where: {
      id: { in: [...allContactIds] },
      contactType: { in: ['personal', 'both'] },
    },
    select: { id: true, name: true },
  })
  const personalIds = new Set(personalContacts.map(c => c.id))
  const nameMap = new Map(personalContacts.map(c => [c.id, c.name]))

  // Filter pairs to only personal contacts
  const personalPairs = normalizedPairs.filter(p => personalIds.has(p.contact_a) && personalIds.has(p.contact_b))

  if (personalPairs.length === 0) return []

  // Union-find clustering
  const uf = new UnionFind()
  const pairStrengths = new Map<string, number>() // track strongest connection per pair

  for (const p of personalPairs) {
    uf.union(p.contact_a, p.contact_b)
    const key = [p.contact_a, p.contact_b].sort().join('|')
    pairStrengths.set(key, (pairStrengths.get(key) || 0) + p.shared_chats)
  }

  const clusters = uf.clusters()

  // Get existing PersonalGroup memberships to avoid duplicates
  const existingMemberships = await prisma.personalGroupMember.findMany({
    select: { contactId: true, groupId: true },
  })
  const existingGroupSets = new Map<string, Set<string>>()
  for (const m of existingMemberships) {
    if (!existingGroupSets.has(m.groupId)) existingGroupSets.set(m.groupId, new Set())
    existingGroupSets.get(m.groupId)!.add(m.contactId)
  }

  // Get group chat names for naming suggestions
  const groupChatNames = await prisma.$queryRawUnsafe<
    Array<{ contact_id: string; chat_name: string; msg_count: number }>
  >(`
    SELECT m.contact_id, gc.name as chat_name, CAST(m.message_count AS INTEGER) as msg_count
    FROM text_group_chat_members m
    JOIN text_group_chats gc ON m.group_chat_id = gc.id
    WHERE m.contact_id IS NOT NULL AND gc.name IS NOT NULL AND gc.name != ''
    ORDER BY m.message_count DESC
  `)
  const contactChatNames = new Map<string, string[]>()
  for (const row of groupChatNames.map(r => ({ ...r, msg_count: Number(r.msg_count) }))) {
    if (!contactChatNames.has(row.contact_id)) contactChatNames.set(row.contact_id, [])
    contactChatNames.get(row.contact_id)!.push(row.chat_name)
  }

  const suggestions: GroupSuggestion[] = []

  for (const [, members] of clusters) {
    // Filter to groups of 3-8 members
    if (members.length < 3 || members.length > 8) continue

    // Check if this cluster already exists as a PersonalGroup
    const memberSet = new Set(members)
    let alreadyExists = false
    for (const [, existingMembers] of existingGroupSets) {
      // Check for significant overlap (>70%)
      const overlap = [...existingMembers].filter(id => memberSet.has(id)).length
      if (overlap / Math.max(memberSet.size, existingMembers.size) > 0.7) {
        alreadyExists = true
        break
      }
    }
    if (alreadyExists) continue

    // Compute total shared chats in the cluster
    let totalShared = 0
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        const key = [members[i], members[j]].sort().join('|')
        totalShared += pairStrengths.get(key) || 0
      }
    }

    // Suggest name from most common chat name among members
    const nameCounts = new Map<string, number>()
    for (const m of members) {
      for (const name of (contactChatNames.get(m) || []).slice(0, 5)) {
        nameCounts.set(name, (nameCounts.get(name) || 0) + 1)
      }
    }
    let suggestedName = 'Suggested Group'
    let maxCount = 0
    for (const [name, count] of nameCounts) {
      if (count > maxCount) {
        maxCount = count
        suggestedName = name
      }
    }

    suggestions.push({
      memberIds: members,
      memberNames: members.map(id => nameMap.get(id) || 'Unknown'),
      suggestedName,
      sharedChatCount: totalShared,
    })
  }

  // Sort by shared chat count (strongest clusters first)
  suggestions.sort((a, b) => b.sharedChatCount - a.sharedChatCount)

  return suggestions.slice(0, 5)
}
