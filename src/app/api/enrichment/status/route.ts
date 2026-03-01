import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const totalContacts = await prisma.contact.count()
    const haveEmail = await prisma.contact.count({ where: { email: { not: null } } })
    // Filter out empty strings too
    const haveEmailReal = await prisma.contact.count({
      where: { AND: [{ email: { not: null } }, { email: { not: '' } }] },
    })
    const missingEmail = totalContacts - haveEmailReal

    // Contacts with no organization (can't do domain resolution)
    const missingOrg = await prisma.contact.count({
      where: {
        OR: [{ organization: null }, { organization: '' }],
        AND: [{ OR: [{ email: null }, { email: '' }] }],
      },
    })

    // Contacts with org but no domain mapping yet
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
    const resolvedDomains = await prisma.organizationDomain.findMany({
      select: { organization: true },
    })
    const resolvedOrgSet = new Set(resolvedDomains.map(d => d.organization))
    const pendingDomainResolution = uniqueOrgs.filter(o => !resolvedOrgSet.has(o)).length

    // Contacts with domain mapping but no email yet and no enrichment result
    const domainMappings = await prisma.organizationDomain.findMany({
      where: { domain: { not: null } },
    })
    const domainOrgSet = new Set(domainMappings.map(d => d.organization))

    const readyForLookup = await prisma.contact.findMany({
      where: {
        AND: [
          { OR: [{ email: null }, { email: '' }] },
          { organization: { not: null } },
          { organization: { not: '' } },
        ],
      },
      select: { id: true, organization: true },
    })

    const existingResults = await prisma.enrichmentResult.findMany({
      select: { contactId: true },
    })
    const enrichedContactIds = new Set(existingResults.map(r => r.contactId))

    const pendingEmailLookup = readyForLookup.filter(
      c => domainOrgSet.has(c.organization!.trim()) && !enrichedContactIds.has(c.id)
    ).length

    // Enrichment results pending review
    const pendingReview = await prisma.enrichmentResult.count({
      where: { status: 'found' },
    })

    const approved = await prisma.enrichmentResult.count({
      where: { status: 'approved' },
    })

    const rejected = await prisma.enrichmentResult.count({
      where: { status: 'rejected' },
    })

    return NextResponse.json({
      totalContacts,
      haveEmail: haveEmailReal,
      missingEmail,
      missingOrg,
      pendingDomainResolution,
      pendingEmailLookup,
      pendingReview,
      approved,
      rejected,
    })
  } catch (error) {
    console.error('[Enrichment] Status error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
