import cron from 'node-cron'
import { PrismaClient } from '@prisma/client'
import { runScoreUpdate } from './score-update'
import { runCadenceCheck } from './cadence-check'
import { generateDailyBriefing } from './daily-briefing'
import { runDbBackup } from './db-backup'
import { runCalendarSync } from './calendar-sync'
import { runMeetingPrepGenerate } from './meeting-prep-generate'
import { runEmailPoll } from './email-poll'

let scheduled = false

export function startScheduler() {
  if (scheduled) return
  scheduled = true

  const prisma = new PrismaClient()

  console.log('[Scheduler] Starting background jobs...')

  // Calendar sync: daily at 5:00 AM (before other jobs)
  cron.schedule('0 5 * * *', async () => {
    console.log('[Job] Running calendar sync...')
    try {
      const result = await runCalendarSync(prisma)
      console.log(`[Job] Calendar sync complete: ${result.meetingCount} meetings for ${result.date}`)
    } catch (error) {
      console.error('[Job] Calendar sync failed:', error)
    }
  })

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

  // Meeting prep generation: daily at 6:15 AM (after briefing, after calendar sync)
  cron.schedule('15 6 * * *', async () => {
    console.log('[Job] Generating meeting prep briefs...')
    try {
      const result = await runMeetingPrepGenerate(prisma)
      console.log(`[Job] Meeting prep complete: ${result.generated} briefs generated, ${result.skipped} skipped`)
    } catch (error) {
      console.error('[Job] Meeting prep generation failed:', error)
    }
  })

  // Email poll: every 5 minutes
  cron.schedule('*/5 * * * *', async () => {
    console.log('[Job] Running email poll...')
    try {
      const result = await runEmailPoll()
      if (result.processed > 0 || result.errors > 0) {
        console.log(`[Job] Email poll: ${result.processed} processed, ${result.skipped} skipped, ${result.errors} errors`)
      }
    } catch (error) {
      console.error('[Job] Email poll failed:', error)
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

  console.log('[Scheduler] Jobs scheduled: email_poll(*/5min), db_backup(2AM), calendar_sync(5AM), score_update(5:15AM), cadence_check(5:30AM), daily_briefing(6AM), meeting_prep(6:15AM)')
}
