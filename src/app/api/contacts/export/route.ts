import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import * as XLSX from 'xlsx'

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { ids } = body as { ids?: string[] }

  const where = ids?.length ? { id: { in: ids } } : {}

  const contacts = await prisma.contact.findMany({
    where,
    orderBy: [{ tier: 'asc' }, { name: 'asc' }],
  })

  const rows = contacts.map(c => {
    let categories: string[] = []
    let tags: string[] = []
    try { categories = JSON.parse(c.categories || '[]') } catch { /* ignore */ }
    try { tags = JSON.parse(c.tags || '[]') } catch { /* ignore */ }

    return {
      Name: c.name,
      Title: c.title || '',
      Organization: c.organization || '',
      Email: c.email || '',
      Phone: c.phone || '',
      Tier: c.tier,
      Status: c.status,
      Categories: categories.join(', '),
      Tags: tags.join(', '),
      'LinkedIn URL': c.linkedinUrl || '',
      'Twitter': c.twitterHandle || '',
      'Website': c.personalWebsite || '',
      'Last Interaction': c.lastInteractionDate || '',
      'Cadence (days)': c.targetCadenceDays,
      'Relationship Strength': c.relationshipStrength,
      'Strategic Value': c.strategicValue,
      'Why They Matter': c.whyTheyMatter || '',
      'Introduction Pathway': c.introductionPathway || '',
      Notes: c.notes || '',
    }
  })

  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Contacts')

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="contacts-export-${new Date().toISOString().split('T')[0]}.xlsx"`,
    },
  })
}
