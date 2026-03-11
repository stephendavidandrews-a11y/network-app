import { PrismaClient } from '@prisma/client'

interface FedRegisterConfig {
  agencies?: string[]      // ["commodity-futures-trading-commission"]
  documentTypes?: string[] // ["NOTICE", "RULE", "PROPOSED_RULE"]
  perPage?: number
}

const DEFAULT_AGENCIES = ['commodity-futures-trading-commission']
const DEFAULT_DOC_TYPES = ['NOTICE', 'RULE', 'PROPOSED_RULE', 'PRORULE']

export async function scrapeFederalRegister(
  prisma: PrismaClient,
  sourceId: string,
  _url: string,
  config: FedRegisterConfig
): Promise<{ discovered: number; skipped: number; error?: string }> {
  const agencies = config.agencies || DEFAULT_AGENCIES
  const docTypes = config.documentTypes || DEFAULT_DOC_TYPES
  const perPage = config.perPage || 20
  let discovered = 0
  let skipped = 0

  try {
    // Fetch recent documents from Federal Register API
    const params = new URLSearchParams({
      'per_page': String(perPage),
      'order': 'newest',
    })

    for (const agency of agencies) {
      params.append('conditions[agencies][]', agency)
    }
    for (const dt of docTypes) {
      params.append('conditions[type][]', dt)
    }

    // Only look at last 30 days
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    params.set('conditions[publication_date][gte]', thirtyDaysAgo.toISOString().split('T')[0])

    const apiUrl = `https://www.federalregister.gov/api/v1/documents.json?${params.toString()}`

    const response = await fetch(apiUrl, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(15000),
    })

    if (!response.ok) {
      return { discovered, skipped, error: `FR API HTTP ${response.status}` }
    }

    const data = await response.json() as {
      results: Array<{
        title: string
        abstract?: string
        publication_date: string
        html_url: string
        type: string
        agencies: Array<{ name: string }>
        dates?: string
      }>
    }

    for (const doc of data.results || []) {
      const rawTitle = doc.title?.trim()
      if (!rawTitle) continue

      const rawUrl = doc.html_url

      // Dedup by URL
      if (rawUrl) {
        const existing = await prisma.discoveredEvent.findFirst({
          where: { sourceId, rawUrl },
        })
        if (existing) { skipped++; continue }
      }

      // For events: public meetings, hearings, roundtables
      // For regulatory intelligence: rules, proposed rules, notices
      const isEventLike = /meeting|hearing|roundtable|workshop|conference|webinar/i.test(rawTitle)

      await prisma.discoveredEvent.create({
        data: {
          sourceId,
          rawTitle,
          rawDescription: doc.abstract?.substring(0, 2000) || null,
          rawDate: doc.publication_date || null,
          rawUrl,
          rawLocation: isEventLike ? 'Washington, DC (check document)' : null,
          rawSpeakers: null,
          status: 'new',
        },
      })
      discovered++
    }

    return { discovered, skipped }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { discovered, skipped, error: message }
  }
}
