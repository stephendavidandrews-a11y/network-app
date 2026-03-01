/**
 * One-time migration script: backfill commitments from JSON in interactions table
 * to the new dedicated commitments table.
 *
 * Run: npx tsx prisma/migrate-commitments.ts
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('Starting commitment migration...')

  // Check if there are already rows in the commitments table
  const existingCount = await prisma.commitment.count()
  if (existingCount > 0) {
    console.log(`⚠ Found ${existingCount} existing commitment rows. Skipping migration to avoid duplicates.`)
    console.log('  If you need to re-run, delete all rows from the commitments table first.')
    return
  }

  // Fetch all interactions with non-empty commitments
  const interactions = await prisma.interaction.findMany({
    where: { commitments: { not: '[]' } },
    select: { id: true, contactId: true, commitments: true, date: true },
  })

  console.log(`Found ${interactions.length} interactions with commitments`)

  let created = 0
  let skipped = 0

  for (const interaction of interactions) {
    let parsed: Array<{
      description: string
      due_date?: string | null
      fulfilled?: boolean
      fulfilled_date?: string | null
    }> = []

    try {
      parsed = JSON.parse(interaction.commitments || '[]')
    } catch {
      console.warn(`  Skipping interaction ${interaction.id}: invalid JSON`)
      skipped++
      continue
    }

    for (const c of parsed) {
      if (!c.description?.trim()) {
        skipped++
        continue
      }

      await prisma.commitment.create({
        data: {
          interactionId: interaction.id,
          contactId: interaction.contactId,
          description: c.description.trim(),
          dueDate: c.due_date || null,
          fulfilled: c.fulfilled || false,
          fulfilledDate: c.fulfilled_date || null,
          // Use the interaction date as an approximate creation time
          createdAt: interaction.date || new Date().toISOString(),
        },
      })
      created++
    }
  }

  console.log(`\nMigration complete:`)
  console.log(`  ✓ Created: ${created} commitment rows`)
  console.log(`  ⊘ Skipped: ${skipped} (empty or invalid)`)

  // Verify
  const totalInDb = await prisma.commitment.count()
  const openInDb = await prisma.commitment.count({ where: { fulfilled: false } })
  console.log(`\nVerification:`)
  console.log(`  Total commitments in table: ${totalInDb}`)
  console.log(`  Open (unfulfilled): ${openInDb}`)
  console.log(`  Fulfilled: ${totalInDb - openInDb}`)
}

main()
  .catch((e) => {
    console.error('Migration failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
