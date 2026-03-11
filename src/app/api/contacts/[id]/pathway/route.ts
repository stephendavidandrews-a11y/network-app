import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { computePathwayScore } from '@/lib/jobs/pathway-scorer'

// GET /api/contacts/[id]/pathway — returns pathway evidence, pretexts, score
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const contact = await prisma.contact.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      organization: true,
      outreachMode: true,
      accessibility: true,
      outreachTiming: true,
      pathwayScore: true,
      pathwayLastEval: true,
      pathwayNotes: true,
    },
  })

  if (!contact) {
    return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
  }

  // Get pathway evidence
  const evidence = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
    `SELECT pe.*, c.name as bridge_name
     FROM pathway_evidence pe
     LEFT JOIN contacts c ON c.id = pe.bridge_contact_id
     WHERE pe.target_contact_id = ?
     ORDER BY pe.detected_at DESC`,
    id
  )

  // Get pretexts
  const pretexts = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
    `SELECT * FROM contact_pretexts
     WHERE contact_id = ?
     ORDER BY created_at DESC`,
    id
  )

  // Get known contacts at same org (for org-entry)
  let orgContacts: Array<Record<string, unknown>> = []
  if (contact.organization) {
    orgContacts = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT id, name, title, tier, outreach_mode, accessibility
       FROM contacts
       WHERE organization = ? AND id != ? AND outreach_mode = 'direct'
       ORDER BY tier ASC`,
      contact.organization,
      id
    )
  }

  return NextResponse.json({
    contact: {
      ...contact,
      pathwayScore: (contact as Record<string, unknown>).pathwayScore,
      pathwayLastEval: (contact as Record<string, unknown>).pathwayLastEval,
      pathwayNotes: (contact as Record<string, unknown>).pathwayNotes,
    },
    evidence,
    pretexts,
    orgContacts,
  })
}

// POST /api/contacts/[id]/pathway — manually add pathway evidence
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json()

  const {
    bridgeContactId,
    evidenceType,
    description,
    confidenceWeight,
    sourceType,
    sourceId,
    expiresAt,
  } = body

  if (!evidenceType || !description) {
    return NextResponse.json(
      { error: 'evidenceType and description are required' },
      { status: 400 }
    )
  }

  // Insert evidence
  const evidenceId = crypto.randomUUID()
  await prisma.$executeRawUnsafe(
    `INSERT INTO pathway_evidence (id, target_contact_id, bridge_contact_id, evidence_type, description, confidence_weight, source_type, source_id, detected_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)`,
    evidenceId,
    id,
    bridgeContactId || null,
    evidenceType,
    description,
    confidenceWeight || 1.0,
    sourceType || 'manual',
    sourceId || null,
    expiresAt || null
  )

  // Recompute score
  const scoreResult = await computePathwayScore(id, prisma)

  return NextResponse.json({
    evidenceId,
    scoreResult,
    message: `Evidence added. Score: ${scoreResult.previousScore} -> ${scoreResult.newScore}`,
  })
}
