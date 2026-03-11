import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// GET /api/pathway/opportunities — contacts crossing score thresholds
export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const minScore = parseFloat(url.searchParams.get('minScore') || '40')
  const limit = parseInt(url.searchParams.get('limit') || '20')

  // High-score pathway contacts
  const highScore = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
    `SELECT c.id, c.name, c.organization, c.title, c.tier,
            c.outreach_mode, c.accessibility, c.outreach_timing,
            c.pathway_score, c.pathway_last_eval, c.pathway_notes,
            (SELECT COUNT(*) FROM pathway_evidence pe WHERE pe.target_contact_id = c.id) as evidence_count,
            (SELECT MAX(pe.detected_at) FROM pathway_evidence pe WHERE pe.target_contact_id = c.id) as latest_evidence
     FROM contacts c
     WHERE c.outreach_mode IN ('pathway', 'org-entry')
       AND c.pathway_score >= ?
     ORDER BY c.pathway_score DESC
     LIMIT ?`,
    minScore,
    limit
  )

  // Recently added evidence (last 7 days)
  const recentEvidence = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
    `SELECT pe.*,
            tc.name as target_name, tc.organization as target_org,
            bc.name as bridge_name
     FROM pathway_evidence pe
     JOIN contacts tc ON tc.id = pe.target_contact_id
     LEFT JOIN contacts bc ON bc.id = pe.bridge_contact_id
     WHERE pe.detected_at >= datetime('now', '-7 days')
     ORDER BY pe.detected_at DESC
     LIMIT 20`
  )

  // Contacts that recently crossed the threshold (scored in last run, score >= minScore)
  const newlyActionable = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
    `SELECT c.id, c.name, c.organization, c.pathway_score, c.pathway_last_eval
     FROM contacts c
     WHERE c.outreach_mode IN ('pathway', 'org-entry')
       AND c.pathway_score >= ?
       AND c.pathway_last_eval >= datetime('now', '-7 days')
     ORDER BY c.pathway_score DESC`,
    minScore
  )

  return NextResponse.json({
    highScoreContacts: highScore,
    recentEvidence,
    newlyActionable,
    summary: {
      totalHighScore: highScore.length,
      recentEvidenceCount: recentEvidence.length,
      newlyActionableCount: newlyActionable.length,
    },
  })
}
