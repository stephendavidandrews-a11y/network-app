import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    let organizations: string[] = body.organizations || []

    // If no specific orgs provided, resolve all unresolved
    if (organizations.length === 0) {
      const contactsWithOrg = await prisma.contact.findMany({
        where: {
          AND: [
            { organization: { not: null } },
            { organization: { not: '' } },
            { OR: [{ email: null }, { email: '' }] },
          ],
        },
        select: { organization: true },
      })

      const uniqueOrgs = Array.from(new Set(contactsWithOrg.map(c => c.organization!.trim())))

      const existing = await prisma.organizationDomain.findMany({
        select: { organization: true },
      })
      const existingSet = new Set(existing.map(d => d.organization))

      organizations = uniqueOrgs.filter(o => !existingSet.has(o))
    }

    if (organizations.length === 0) {
      return NextResponse.json({ resolved: [], message: 'No organizations need resolution' })
    }

    // Process in batches of 25
    const allResolved: Array<{
      organization: string
      domain: string | null
      confidence: string
      notes: string | null
    }> = []

    for (let i = 0; i < organizations.length; i += 25) {
      const batch = organizations.slice(i, i + 25)
      const numberedList = batch.map((org, idx) => `${idx + 1}. ${org}`).join('\n')

      const message = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        messages: [
          {
            role: 'user',
            content: `Given the following organizations, provide the most likely professional web domain for each.
Return ONLY valid JSON, no markdown: [{ "organization": "...", "domain": "...", "confidence": "high|medium|low", "notes": "..." }]

Rules:
- For government agencies (SEC, CFTC, Treasury, FDIC, OCC, Federal Reserve, Congress, Senate, House, etc.), set domain to null and notes to "Government agency — use personal email or LinkedIn"
- For well-known companies/orgs, confidence should be "high"
- For ambiguous org names, confidence should be "medium" or "low"
- Domain should be just the domain (e.g., "coincenter.org"), not a full URL
- If you're unsure of the domain, set confidence to "low"

Organizations:
${numberedList}`,
          },
        ],
      })

      const responseText =
        message.content[0].type === 'text' ? message.content[0].text : ''

      // Parse JSON from response (handle possible markdown wrapping)
      let parsed: Array<{
        organization: string
        domain: string | null
        confidence: string
        notes: string | null
      }> = []

      try {
        const jsonMatch = responseText.match(/\[[\s\S]*\]/)
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[0])
        }
      } catch (parseErr) {
        console.error('[Enrichment] Failed to parse Claude response:', parseErr)
        console.error('[Enrichment] Raw response:', responseText)
        continue
      }

      // Write to database
      for (const item of parsed) {
        try {
          await prisma.organizationDomain.upsert({
            where: { organization: item.organization },
            create: {
              organization: item.organization,
              domain: item.domain || null,
              resolvedBy: 'claude',
              confidence: item.confidence || 'medium',
              notes: item.notes || null,
            },
            update: {
              domain: item.domain || null,
              resolvedBy: 'claude',
              confidence: item.confidence || 'medium',
              notes: item.notes || null,
            },
          })
          allResolved.push(item)
        } catch (dbErr) {
          console.error(`[Enrichment] Failed to save domain for ${item.organization}:`, dbErr)
        }
      }
    }

    return NextResponse.json({ resolved: allResolved })
  } catch (error) {
    console.error('[Enrichment] Domain resolution error:', error)
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
