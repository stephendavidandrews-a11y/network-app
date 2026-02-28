import { PrismaClient } from '@prisma/client'
import * as XLSX from 'xlsx'
import * as crypto from 'crypto'
import * as path from 'path'
import * as fs from 'fs'

const prisma = new PrismaClient()

const TIER_CADENCE: Record<number, number> = { 1: 30, 2: 60, 3: 90 }

interface ParsedContact {
  name: string
  title: string | null
  organization: string | null
  email: string | null
  linkedinUrl: string | null
  twitterHandle: string | null
  personalWebsite: string | null
  categories: string[]
  tags: string[]
  tier: number
  status: string
  whyTheyMatter: string | null
  connectionToHawleyOrbit: string | null
  introductionPathway: string | null
  notes: string | null
}

// ── Parse network_targets_expanded.xlsx ──
// Columns: Category, Name, Organization, Title/Role, Why They Matter, Connection to Hawley Orbit, Tier, Status
interface ExpandedRow {
  Name?: string
  name?: string
  Organization?: string
  organization?: string
  'Title/Role'?: string
  Title?: string
  title?: string
  Category?: string
  category?: string
  'Why They Matter'?: string
  'Connection to Hawley Orbit'?: string
  Tier?: string | number
  tier?: string | number
  Status?: string
  status?: string
  Notes?: string
  notes?: string
  Email?: string
  email?: string
}

function parseExpandedRow(row: ExpandedRow): ParsedContact | null {
  const name = (row.Name || row.name || '').toString().trim()
  if (!name) return null

  const tierRaw = row.Tier || row.tier || '2'
  const tierStr = String(tierRaw).replace(/[^0-9]/g, '')
  const tier = Math.min(Math.max(parseInt(tierStr) || 2, 1), 3)

  const categoryStr = (row.Category || row.category || '').toString().trim()
  const categories = categoryStr
    ? categoryStr.split(/[,;]/).map((c: string) => c.trim()).filter(Boolean)
    : []

  const statusRaw = (row.Status || row.status || 'target').toString().toLowerCase().trim()
  const validStatuses = ['target', 'outreach_sent', 'active', 'warm', 'cold', 'dormant']
  const status = validStatuses.includes(statusRaw) ? statusRaw : 'target'

  return {
    name,
    title: (row['Title/Role'] || row.Title || row.title || '').toString().trim() || null,
    organization: (row.Organization || row.organization || '').toString().trim() || null,
    email: (row.Email || row.email || '').toString().trim() || null,
    linkedinUrl: null,
    twitterHandle: null,
    personalWebsite: null,
    categories,
    tags: [],
    tier,
    status,
    whyTheyMatter: (row['Why They Matter'] || '').toString().trim() || null,
    connectionToHawleyOrbit: (row['Connection to Hawley Orbit'] || '').toString().trim() || null,
    introductionPathway: null,
    notes: (row.Notes || row.notes || '').toString().trim() || null,
  }
}

// ── Parse CFTC_Contacts_Hunter_Enriched.xlsx ──
// Columns: Name, Organization, Title, Email, Confidence, Verified, Source, Domain,
//          Priority, Workstream, Relationship Type, Profile URL, LinkedIn, Key Topics, Notes
interface HunterRow {
  Name?: string
  name?: string
  Organization?: string
  organization?: string
  Title?: string
  title?: string
  Email?: string
  email?: string
  Confidence?: string | number
  Verified?: string
  Source?: string
  Domain?: string
  Priority?: string
  priority?: string
  Workstream?: string
  workstream?: string
  'Relationship Type'?: string
  'Profile URL'?: string
  LinkedIn?: string
  linkedin?: string
  'Key Topics'?: string
  Notes?: string
  notes?: string
}

function parseHunterRow(row: HunterRow): ParsedContact | null {
  const name = (row.Name || row.name || '').toString().trim()
  if (!name) return null

  // Map Priority → tier: High=1, Medium=2, Low/empty=3
  const priorityRaw = (row.Priority || row.priority || '').toString().toLowerCase().trim()
  let tier = 2
  if (priorityRaw === 'high' || priorityRaw === '1') tier = 1
  else if (priorityRaw === 'medium' || priorityRaw === 'med' || priorityRaw === '2') tier = 2
  else if (priorityRaw === 'low' || priorityRaw === '3') tier = 3

  // Map Workstream → categories
  const workstream = (row.Workstream || row.workstream || '').toString().trim()
  const categories: string[] = []
  if (workstream) {
    categories.push(...workstream.split(/[,;]/).map((c: string) => c.trim()).filter(Boolean))
  }

  // Map Relationship Type → additional category
  const relType = (row['Relationship Type'] || '').toString().trim()
  if (relType && !categories.includes(relType)) {
    categories.push(relType)
  }

  // Map Key Topics → tags
  const keyTopics = (row['Key Topics'] || '').toString().trim()
  const tags = keyTopics
    ? keyTopics.split(/[,;]/).map((t: string) => t.trim()).filter(Boolean)
    : []

  // LinkedIn URL
  const linkedin = (row.LinkedIn || row.linkedin || '').toString().trim() || null
  const profileUrl = (row['Profile URL'] || '').toString().trim() || null

  // Use Profile URL as website if it's not a LinkedIn URL, otherwise use LinkedIn
  let linkedinUrl = linkedin
  let personalWebsite: string | null = null
  if (profileUrl) {
    if (profileUrl.includes('linkedin.com')) {
      if (!linkedinUrl) linkedinUrl = profileUrl
    } else {
      personalWebsite = profileUrl
    }
  }

  return {
    name,
    title: (row.Title || row.title || '').toString().trim() || null,
    organization: (row.Organization || row.organization || '').toString().trim() || null,
    email: (row.Email || row.email || '').toString().trim() || null,
    linkedinUrl,
    twitterHandle: null,
    personalWebsite,
    categories,
    tags,
    tier,
    status: 'target',
    whyTheyMatter: null,
    connectionToHawleyOrbit: null,
    introductionPathway: null,
    notes: (row.Notes || row.notes || '').toString().trim() || null,
  }
}

function mergeContacts(existing: ParsedContact, incoming: ParsedContact): ParsedContact {
  // Merge: prefer non-null values, combine categories/tags
  const mergedCategories = Array.from(new Set([...existing.categories, ...incoming.categories]))
  const mergedTags = Array.from(new Set([...existing.tags, ...incoming.tags]))

  return {
    name: existing.name,
    title: existing.title || incoming.title,
    organization: existing.organization || incoming.organization,
    email: existing.email || incoming.email,
    linkedinUrl: existing.linkedinUrl || incoming.linkedinUrl,
    twitterHandle: existing.twitterHandle || incoming.twitterHandle,
    personalWebsite: existing.personalWebsite || incoming.personalWebsite,
    categories: mergedCategories,
    tags: mergedTags,
    tier: Math.min(existing.tier, incoming.tier), // Higher priority (lower number) wins
    status: existing.status !== 'target' ? existing.status : incoming.status,
    whyTheyMatter: existing.whyTheyMatter || incoming.whyTheyMatter,
    connectionToHawleyOrbit: existing.connectionToHawleyOrbit || incoming.connectionToHawleyOrbit,
    introductionPathway: existing.introductionPathway || incoming.introductionPathway,
    notes: [existing.notes, incoming.notes].filter(Boolean).join('\n') || null,
  }
}

async function main() {
  console.log('Starting seed...')

  const networkDir = path.resolve(__dirname, '..', '..')
  const contacts = new Map<string, ParsedContact>()

  // ── File 1: network_targets_expanded.xlsx ──
  const expandedPath = path.join(networkDir, 'network_targets_expanded.xlsx')
  if (fs.existsSync(expandedPath)) {
    console.log(`Reading: ${expandedPath}`)
    const workbook = XLSX.readFile(expandedPath)
    let totalRows = 0

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName]
      const rows = XLSX.utils.sheet_to_json<ExpandedRow>(sheet)
      console.log(`  Sheet "${sheetName}": ${rows.length} rows`)
      totalRows += rows.length

      for (const row of rows) {
        const parsed = parseExpandedRow(row)
        if (!parsed) continue

        const key = `${parsed.name.toLowerCase()}|${(parsed.organization || '').toLowerCase()}`
        const existing = contacts.get(key)
        if (existing) {
          contacts.set(key, mergeContacts(existing, parsed))
        } else {
          contacts.set(key, parsed)
        }
      }
    }
    console.log(`  Total rows processed: ${totalRows}`)
  } else {
    console.log(`File not found: ${expandedPath}, skipping...`)
  }

  // ── File 2: CFTC_Contacts_Hunter_Enriched.xlsx ──
  const hunterPath = path.join(networkDir, 'CFTC_Contacts_Hunter_Enriched.xlsx')
  if (fs.existsSync(hunterPath)) {
    console.log(`Reading: ${hunterPath}`)
    const workbook = XLSX.readFile(hunterPath)
    let totalRows = 0

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName]
      const rows = XLSX.utils.sheet_to_json<HunterRow>(sheet)
      console.log(`  Sheet "${sheetName}": ${rows.length} rows`)
      totalRows += rows.length

      for (const row of rows) {
        const parsed = parseHunterRow(row)
        if (!parsed) continue

        const key = `${parsed.name.toLowerCase()}|${(parsed.organization || '').toLowerCase()}`
        const existing = contacts.get(key)
        if (existing) {
          contacts.set(key, mergeContacts(existing, parsed))
        } else {
          contacts.set(key, parsed)
        }
      }
    }
    console.log(`  Total rows processed: ${totalRows}`)
  } else {
    console.log(`File not found: ${hunterPath}, skipping...`)
  }

  console.log(`Deduped to ${contacts.size} unique contacts`)

  // Clear existing contacts before seeding
  const existingCount = await prisma.contact.count()
  if (existingCount > 0) {
    console.log(`Clearing ${existingCount} existing contacts...`)
    await prisma.contact.deleteMany()
  }

  let created = 0
  const entries = Array.from(contacts.entries())
  for (const [, data] of entries) {
    if (!data) continue
    await prisma.contact.create({
      data: {
        id: crypto.randomUUID(),
        name: data.name,
        title: data.title,
        organization: data.organization,
        email: data.email,
        linkedinUrl: data.linkedinUrl,
        twitterHandle: data.twitterHandle,
        personalWebsite: data.personalWebsite,
        tier: data.tier,
        categories: JSON.stringify(data.categories),
        tags: JSON.stringify(data.tags),
        targetCadenceDays: TIER_CADENCE[data.tier] || 60,
        status: data.status,
        whyTheyMatter: data.whyTheyMatter,
        connectionToHawleyOrbit: data.connectionToHawleyOrbit,
        introductionPathway: data.introductionPathway,
        notes: data.notes,
      },
    })
    created++
  }

  console.log(`Created ${created} contacts`)

  // ── Seed default settings ──
  const defaultSettings = [
    {
      key: 'style_guide',
      value: JSON.stringify({
        tone: 'Professional but warm. Direct. No fluff.',
        structure: 'Short emails: 3-5 sentences. Lead with the hook. Close with a specific ask.',
        never_say: ['Per my last email', 'I hope this finds you well', 'Circling back', 'Just checking in'],
        do_say: ['Reference specific shared interests or recent work', 'Be concrete about next steps', 'Show genuine interest'],
      }),
    },
    {
      key: 'expertise_profile',
      value: JSON.stringify({
        primary: ['Administrative law', 'Commodity regulation', 'Crypto regulatory policy', 'Loper Bright / Chevron deference'],
        secondary: ['Prediction markets', 'DeFi governance', 'Congressional oversight', 'Agency rulemaking'],
        bio_short: 'Government attorney focused on commodity and crypto regulation, admin law reform, and prediction markets.',
        bio_long: '',
      }),
    },
    {
      key: 'tier_cadence',
      value: JSON.stringify({ '1': 30, '2': 60, '3': 90 }),
    },
    {
      key: 'daily_outreach_cap',
      value: '5',
    },
    {
      key: 'venues',
      value: '[]',
    },
  ]

  for (const setting of defaultSettings) {
    await prisma.appSetting.upsert({
      where: { key: setting.key },
      update: { value: setting.value },
      create: { key: setting.key, value: setting.value },
    })
  }

  console.log('Seeded default settings')
  console.log('Seed complete!')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
