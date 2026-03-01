import cron from 'node-cron'
import { PrismaClient } from '@prisma/client'
import { runScoreUpdate } from './score-update'
import { runCadenceCheck } from './cadence-check'
import { generateDailyBriefing } from './daily-briefing'
import { runDbBackup } from './db-backup'

let scheduled = false

export function startScheduler() {
  if (scheduled) return
  scheduled = true

  const prisma = new PrismaClient()

  console.log('[Scheduler] Starting background jobs...')

  // Score update: daily at 5:15 AM
  cron.schedule('15 5 * * *', async () => {
    console.log('[Job] Running score update...')
    try {
      const result = await runScoreUpdate(prisma)
      console.log(`[Job] Score update complete: ${result.updated} contacts updated`)
    } catch (error) {
      console.error('[Job] Score update failed:', error)
    }
  })

  // Cadence check: daily at 5:30 AM
  cron.schedule('30 5 * * *', async () => {
    console.log('[Job] Running cadence check...')
    try {
      const result = await runCadenceCheck(prisma)
      console.log(`[Job] Cadence check complete: ${result.generated} outreach items generated`)
    } catch (error) {
      console.error('[Job] Cadence check failed:', error)
    }
  })

  // Daily briefing: daily at 6:00 AM
  cron.schedule('0 6 * * *', async () => {
    console.log('[Job] Generating daily briefing...')
    try {
      const result = await generateDailyBriefing(prisma)
      console.log(`[Job] Daily briefing generated for ${result.date}`)
    } catch (error) {
      console.error('[Job] Daily briefing generation failed:', error)
    }
  })

  // Database backup: daily at 2:00 AM
  cron.schedule('0 2 * * *', () => {
    console.log('[Job] Running database backup...')
    try {
      const result = runDbBackup()
      console.log(`[Job] Backup created: ${result.backupPath} (${result.cleaned} old backups cleaned)`)
    } catch (error) {
      console.error('[Job] Database backup failed:', error)
    }
  })

  console.log('[Scheduler] Jobs scheduled: db_backup(2AM), score_update(5:15AM), cadence_check(5:30AM), daily_briefing(6AM)')
}
