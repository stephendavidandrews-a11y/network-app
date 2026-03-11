/**
 * GET /api/inbox/[id]/provenance-suggestions
 *
 * Returns provenance suggestions for an inbox item by checking
 * recent outreach to contacts at the same organization or email domain.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const item = await prisma.ingestionItem.findUnique({
      where: { id },
      select: {
        id: true,
        contactId: true,
        rawContent: true,
        contact: {
          select: { id: true, name: true, organization: true, email: true },
        },
      },
    })

    if (!item || !item.contactId) {
      return NextResponse.json({ suggestions: [] })
    }

    const suggestions: Array<{
      sourceContactId: string
      sourceContactName: string
      sourceOrg: string | null
      outreachDate: string
      outreachSubject: string | null
      matchReason: 'same_org' | 'same_domain'
    }> = []

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

    // Check 1: Same-org match via recent outreach
    if (item.contact?.organization) {
      const recentOutreach = await prisma.outreachQueue.findMany({
        where: {
          status: 'sent',
          sentAt: { gte: sevenDaysAgo },
          contact: {
            organization: item.contact.organization,
            id: { not: item.contactId },
          },
        },
        select: {
          contactId: true,
          sentAt: true,
          draftSubject: true,
          contact: {
            select: { id: true, name: true, organization: true },
          },
        },
        orderBy: { sentAt: 'desc' },
        take: 3,
      })

      for (const oq of recentOutreach) {
        if (!suggestions.some(s => s.sourceContactId === oq.contactId)) {
          suggestions.push({
            sourceContactId: oq.contactId,
            sourceContactName: oq.contact.name,
            sourceOrg: oq.contact.organization,
            outreachDate: oq.sentAt || '',
            outreachSubject: oq.draftSubject,
            matchReason: 'same_org',
          })
        }
      }
    }

    // Check 2: Same email domain match
    if (item.rawContent) {
      const emailPattern = /[\w.+-]+@([\w.-]+\.[a-zA-Z]{2,})/g
      const domains = new Set<string>()
      let match: RegExpExecArray | null
      while ((match = emailPattern.exec(item.rawContent)) !== null) {
        const domain = match[1].toLowerCase()
        if (!domain.includes('stephenandrews') && !domain.includes('gmail') && !domain.includes('yahoo') && !domain.includes('hotmail')) {
          domains.add(domain)
        }
      }

      if (domains.size > 0) {
        // Find recent outreach to contacts with matching email domains
        const recentOutreach = await prisma.outreachQueue.findMany({
          where: {
            status: 'sent',
            sentAt: { gte: sevenDaysAgo },
            contact: {
              id: { not: item.contactId },
            },
          },
          select: {
            contactId: true,
            sentAt: true,
            draftSubject: true,
            contact: {
              select: { id: true, name: true, organization: true, email: true },
            },
          },
          orderBy: { sentAt: 'desc' },
          take: 20,
        })

        for (const oq of recentOutreach) {
          if (oq.contact.email) {
            const contactDomain = oq.contact.email.split('@')[1]?.toLowerCase()
            if (contactDomain && domains.has(contactDomain)) {
              if (!suggestions.some(s => s.sourceContactId === oq.contactId)) {
                suggestions.push({
                  sourceContactId: oq.contactId,
                  sourceContactName: oq.contact.name,
                  sourceOrg: oq.contact.organization,
                  outreachDate: oq.sentAt || '',
                  outreachSubject: oq.draftSubject,
                  matchReason: 'same_domain',
                })
              }
            }
          }
        }
      }
    }

    return NextResponse.json({ suggestions })
  } catch (error) {
    console.error('[Provenance] Suggestions error:', error)
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
