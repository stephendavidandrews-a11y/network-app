import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

const HUNTER_BASE = 'https://api.hunter.io/v2'

async function hunterEmailFinder(
  domain: string,
  firstName: string,
  lastName: string
): Promise<{ email: string | null; score: number | null; raw: unknown }> {
  const apiKey = process.env.HUNTER_API_KEY
  if (!apiKey) throw new Error('HUNTER_API_KEY not configured')

  const params = new URLSearchParams({
    domain,
    first_name: firstName,
    last_name: lastName,
    api_key: apiKey,
  })

  const res = await fetch(`${HUNTER_BASE}/email-finder?${params}`)
  const data = await res.json()

  if (!res.ok) {
    const errMsg = data?.errors?.[0]?.details || data?.error || res.statusText
    throw new Error(`Hunter API error: ${errMsg}`)
  }

  return {
    email: data.data?.email || null,
    score: data.data?.score ?? null,
    raw: data,
  }
}

function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/)
  if (parts.length === 1) return { firstName: parts[0], lastName: '' }
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' '),
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { contactId, batch } = body

    if (!process.env.HUNTER_API_KEY) {
      return NextResponse.json(
        { error: 'HUNTER_API_KEY not configured. Add it to .env.local on the server.' },
        { status: 503 }
      )
    }

    let contactsToProcess: Array<{
      id: string
      name: string
      organization: string
    }> = []

    if (contactId) {
      // Single contact
      const contact = await prisma.contact.findUnique({
        where: { id: contactId },
        select: { id: true, name: true, organization: true, email: true },
      })
      if (!contact) {
        return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
      }
      if (contact.email) {
        return NextResponse.json({ error: 'Contact already has an email' }, { status: 400 })
      }
      if (!contact.organization) {
        return NextResponse.json({ error: 'Contact has no organization' }, { status: 400 })
      }
      contactsToProcess = [{ id: contact.id, name: contact.name, organization: contact.organization }]
    } else if (batch) {
      // All contacts ready for lookup: have org, have domain mapping, no email, no existing result
      const domainMappings = await prisma.organizationDomain.findMany({
        where: { domain: { not: null } },
      })
      const domainMap = new Map(domainMappings.map(d => [d.organization, d.domain!]))

      const contacts = await prisma.contact.findMany({
        where: {
          AND: [
            { OR: [{ email: null }, { email: '' }] },
            { organization: { not: null } },
            { organization: { not: '' } },
          ],
        },
        select: { id: true, name: true, organization: true },
      })

      const existingResults = await prisma.enrichmentResult.findMany({
        select: { contactId: true },
      })
      const enrichedSet = new Set(existingResults.map(r => r.contactId))

      contactsToProcess = contacts.filter(
        c => domainMap.has(c.organization!.trim()) && !enrichedSet.has(c.id)
      ).map(c => ({ id: c.id, name: c.name, organization: c.organization! }))
    } else {
      return NextResponse.json({ error: 'Provide contactId or batch=true' }, { status: 400 })
    }

    if (contactsToProcess.length === 0) {
      return NextResponse.json({ results: [], message: 'No contacts to process' })
    }

    // Get domain mappings
    const domainMappings = await prisma.organizationDomain.findMany({
      where: { domain: { not: null } },
    })
    const domainMap = new Map(domainMappings.map(d => [d.organization, d.domain!]))

    const results: Array<{
      contactId: string
      name: string
      email: string | null
      score: number | null
      status: string
      error?: string
    }> = []

    for (let i = 0; i < contactsToProcess.length; i++) {
      const contact = contactsToProcess[i]
      const domain = domainMap.get(contact.organization.trim())

      if (!domain) {
        results.push({
          contactId: contact.id,
          name: contact.name,
          email: null,
          score: null,
          status: 'error',
          error: 'No domain mapping found',
        })
        continue
      }

      try {
        const { firstName, lastName } = splitName(contact.name)
        const hunterResult = await hunterEmailFinder(domain, firstName, lastName)

        const status = hunterResult.email ? 'found' : 'not_found'

        await prisma.enrichmentResult.create({
          data: {
            contactId: contact.id,
            source: 'hunter',
            email: hunterResult.email,
            score: hunterResult.score,
            domain,
            rawResponse: JSON.stringify(hunterResult.raw),
            status,
          },
        })

        results.push({
          contactId: contact.id,
          name: contact.name,
          email: hunterResult.email,
          score: hunterResult.score,
          status,
        })
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err)
        console.error(`[Enrichment] Hunter lookup failed for ${contact.name}:`, errMsg)

        await prisma.enrichmentResult.create({
          data: {
            contactId: contact.id,
            source: 'hunter',
            email: null,
            score: null,
            domain,
            rawResponse: JSON.stringify({ error: errMsg }),
            status: 'error',
          },
        })

        results.push({
          contactId: contact.id,
          name: contact.name,
          email: null,
          score: null,
          status: 'error',
          error: errMsg,
        })
      }

      // Rate limiting: 200ms between requests
      if (i < contactsToProcess.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 200))
      }
    }

    return NextResponse.json({ results })
  } catch (error) {
    console.error('[Enrichment] Find email error:', error)
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
