import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const { sourceId, targetId } = await request.json()

    if (!sourceId || !targetId) {
      return NextResponse.json({ error: 'sourceId and targetId are required' }, { status: 400 })
    }
    if (sourceId === targetId) {
      return NextResponse.json({ error: 'Cannot merge a contact into itself' }, { status: 400 })
    }

    const [source, target] = await Promise.all([
      prisma.contact.findUnique({ where: { id: sourceId } }),
      prisma.contact.findUnique({ where: { id: targetId } }),
    ])

    if (!source) return NextResponse.json({ error: 'Source contact not found' }, { status: 404 })
    if (!target) return NextResponse.json({ error: 'Target contact not found' }, { status: 404 })

    const results: Record<string, number> = {}

    const r1 = await prisma.interaction.updateMany({ where: { contactId: sourceId }, data: { contactId: targetId } })
    results.interactions = r1.count

    const r2 = await prisma.intelligenceSignal.updateMany({ where: { contactId: sourceId }, data: { contactId: targetId } })
    results.signals = r2.count

    const r3 = await prisma.outreachQueue.updateMany({ where: { contactId: sourceId }, data: { contactId: targetId } })
    results.outreach = r3.count

    const r4 = await prisma.commitment.updateMany({ where: { contactId: sourceId }, data: { contactId: targetId } })
    results.commitments = r4.count

    const r5 = await prisma.meetingPrep.updateMany({ where: { contactId: sourceId }, data: { contactId: targetId } })
    results.meetingPreps = r5.count

    const r6 = await prisma.standingOffer.updateMany({ where: { contactId: sourceId }, data: { contactId: targetId } })
    results.standingOffers = r6.count

    const r7 = await prisma.schedulingLead.updateMany({ where: { contactId: sourceId }, data: { contactId: targetId } })
    results.schedulingLeads = r7.count

    const r8 = await prisma.lifeEvent.updateMany({ where: { contactId: sourceId }, data: { contactId: targetId } })
    results.lifeEvents = r8.count

    const r9 = await prisma.referencedResource.updateMany({ where: { contactId: sourceId }, data: { contactId: targetId } })
    results.referencedResources = r9.count

    const r10 = await prisma.contactDossier.updateMany({ where: { contactId: sourceId }, data: { contactId: targetId } })
    results.dossiers = r10.count

    const r11 = await prisma.ingestionItem.updateMany({ where: { contactId: sourceId }, data: { contactId: targetId } })
    results.ingestionItems = r11.count

    const r12 = await prisma.enrichmentResult.updateMany({ where: { contactId: sourceId }, data: { contactId: targetId } })
    results.enrichmentResults = r12.count

    // Contact Relationships: reassign and deduplicate
    const sqlUpdateA = 'UPDATE contact_relationships SET contact_a_id = ? WHERE contact_a_id = ? AND contact_b_id != ?'
    const sqlUpdateB = 'UPDATE contact_relationships SET contact_b_id = ? WHERE contact_b_id = ? AND contact_a_id != ?'
    const sqlDeleteSelf = 'DELETE FROM contact_relationships WHERE contact_a_id = contact_b_id'
    const sqlDeleteDups = 'DELETE FROM contact_relationships WHERE rowid NOT IN (SELECT MIN(rowid) FROM contact_relationships GROUP BY contact_a_id, contact_b_id)'

    await prisma.$executeRawUnsafe(sqlUpdateA, targetId, sourceId, targetId)
    await prisma.$executeRawUnsafe(sqlUpdateB, targetId, sourceId, targetId)
    await prisma.$executeRawUnsafe(sqlDeleteSelf)
    await prisma.$executeRawUnsafe(sqlDeleteDups)

    // Merge metadata: fill blanks on target from source
    const updates: Record<string, any> = {}
    if (!target.title && source.title) updates.title = source.title
    if (!target.organization && source.organization) updates.organization = source.organization
    if (!target.email && source.email) updates.email = source.email
    if (!target.phone && source.phone) updates.phone = source.phone
    if (!target.linkedinUrl && source.linkedinUrl) updates.linkedinUrl = source.linkedinUrl
    if (!target.twitterHandle && source.twitterHandle) updates.twitterHandle = source.twitterHandle
    if (!target.personalWebsite && source.personalWebsite) updates.personalWebsite = source.personalWebsite
    if (!target.photoUrl && source.photoUrl) updates.photoUrl = source.photoUrl
    if (!target.introductionPathway && source.introductionPathway) updates.introductionPathway = source.introductionPathway
    if (!target.connectionToHawleyOrbit && source.connectionToHawleyOrbit) updates.connectionToHawleyOrbit = source.connectionToHawleyOrbit
    if (!target.whyTheyMatter && source.whyTheyMatter) updates.whyTheyMatter = source.whyTheyMatter
    if (!target.notes && source.notes) {
      updates.notes = source.notes
    } else if (target.notes && source.notes) {
      updates.notes = target.notes + '\n\n--- Merged from ' + source.name + ' ---\n' + source.notes
    }

    if (source.tier < target.tier) updates.tier = source.tier
    if (source.relationshipStrength > target.relationshipStrength) updates.relationshipStrength = source.relationshipStrength
    if (source.strategicValue > target.strategicValue) updates.strategicValue = source.strategicValue

    try {
      const targetTags: string[] = JSON.parse(target.tags || '[]')
      const sourceTags: string[] = JSON.parse(source.tags || '[]')
      const mergedTags = Array.from(new Set([...targetTags, ...sourceTags]))
      if (mergedTags.length > targetTags.length) updates.tags = JSON.stringify(mergedTags)

      const targetCats: string[] = JSON.parse(target.categories || '[]')
      const sourceCats: string[] = JSON.parse(source.categories || '[]')
      const mergedCats = Array.from(new Set([...targetCats, ...sourceCats]))
      if (mergedCats.length > targetCats.length) updates.categories = JSON.stringify(mergedCats)
    } catch {}

    if (Object.keys(updates).length > 0) {
      updates.updatedAt = new Date().toISOString()
      await prisma.contact.update({ where: { id: targetId }, data: updates })
    }

    await prisma.contact.delete({ where: { id: sourceId } })

    return NextResponse.json({
      success: true,
      merged: {
        from: source.name,
        into: target.name,
        recordsTransferred: results,
        metadataFieldsMerged: Object.keys(updates).filter(k => k !== 'updatedAt'),
      },
    })
  } catch (err) {
    console.error('[Merge] Error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Merge failed' },
      { status: 500 }
    )
  }
}
