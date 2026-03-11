import cron from 'node-cron'
import { PrismaClient } from '@prisma/client'
import { runScoreUpdate } from './score-update'
import { runCadenceCheck } from './cadence-check'
import { generateDailyBriefing } from './daily-briefing'
import { runDbBackup } from './db-backup'
import { runCalendarSync } from './calendar-sync'
import { runMeetingPrepGenerate } from './meeting-prep-generate'
import { runEmailPoll } from './email-poll'
import { runPodcastMonitor } from '../visibility/podcast-monitor'
import { runEventDiscovery, runEventClassification, runContentTriage, runNeedsFetchRetriage, runContentIngestion, runContentExtraction, runIntelBriefGeneration } from './event-discovery'
import { runPathwayScorer } from './pathway-scorer'

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

  // Event discovery: daily at 2:30 AM
  cron.schedule('30 2 * * *', async () => {
    console.log('[Job] Running event discovery...')
    try {
      const result = await runEventDiscovery(prisma)
      console.log(`[Job] Event discovery complete: ${result.sourcesProcessed} sources, ${result.totalDiscovered} events discovered`)
    } catch (error) {
      console.error('[Job] Event discovery failed:', error)
    }
  })


  // Podcast monitor: daily at 2:45 AM
  cron.schedule('45 2 * * *', async () => {
    console.log('[Job] Running podcast monitor...')
    try {
      const result = await runPodcastMonitor(prisma)
      console.log(`[Job] Podcast monitor: ${result.podcastsChecked} podcasts, ${result.newEpisodes} episodes, ${result.pitchWindows} pitch windows`)
    } catch (error) {
      console.error('[Job] Podcast monitor failed:', error)
    }
  })

  // Event classification: daily at 3:00 AM (events only, excludes Intel)
  cron.schedule('0 3 * * *', async () => {
    console.log('[Job] Running event classification...')
    try {
      const result = await runEventClassification(prisma)
      console.log(`[Job] Event classification complete: ${result.classified} classified, ${result.dismissed} dismissed`)
    } catch (error) {
      console.error('[Job] Event classification failed:', error)
    }
  })

  // Content triage: daily at 3:05 AM (title-level scoring for Intel sources)
  cron.schedule('5 3 * * *', async () => {
    console.log('[Job] Running content triage...')
    try {
      const result = await runContentTriage(prisma)
      console.log(`[Job] Content triage complete: ${result.triaged} triaged, ${result.filtered} filtered`)
    } catch (error) {
      console.error('[Job] Content triage failed:', error)
    }
  })

  // Content ingestion: daily at 3:15 AM (fetch full text for triaged articles)
  cron.schedule('15 3 * * *', async () => {
    console.log('[Job] Running content ingestion...')
    try {
      const result = await runContentIngestion(prisma)
      console.log(`[Job] Content ingestion complete: ${result.fetched} fetched, ${result.skipped} skipped`)
    } catch (error) {
      console.error('[Job] Content ingestion failed:', error)
    }
  })


  // Needs-fetch re-triage: daily at 3:20 AM (re-score vague titles using full text)
  cron.schedule('20 3 * * *', async () => {
    console.log('[Job] Running needs_fetch re-triage...')
    try {
      const result = await runNeedsFetchRetriage(prisma)
      console.log(`[Job] Needs-fetch re-triage: ${result.triaged} triaged, ${result.filtered} filtered`)
    } catch (error) {
      console.error('[Job] Needs-fetch re-triage failed:', error)
    }
  })

  // Content extraction: daily at 3:30 AM (Claude intelligence extraction)
  cron.schedule('30 3 * * *', async () => {
    console.log('[Job] Running content extraction...')
    try {
      const result = await runContentExtraction(prisma)
      console.log(`[Job] Content extraction complete: ${result.extracted} extracted`)
    } catch (error) {
      console.error('[Job] Content extraction failed:', error)
    }
  })


  // Pathway scoring: weekly on Sunday at 3:00 AM
  cron.schedule('0 3 * * 0', async () => {
    console.log('[Job] Running pathway scoring...')
    try {
      const result = await runPathwayScorer(prisma)
      console.log(`[Job] Pathway scoring complete: ${result.scored} scored, ${result.changed} changed, ${result.highScoreContacts} high-score`)
    } catch (error) {
      console.error('[Job] Pathway scoring failed:', error)
    }
  })

  // Weekly Intel Brief: Sunday at midnight
  cron.schedule('0 0 * * 0', async () => {
    console.log('[Job] Generating weekly intel brief...')
    try {
      const result = await runIntelBriefGeneration(prisma)
      console.log(`[Job] Intel brief generated for ${result.weekStart}: ${result.extractionCount} extractions`)
    } catch (error) {
      console.error('[Job] Intel brief generation failed:', error)
    }
  })

  console.log('[Scheduler] Jobs scheduled: email_poll(*/5min), db_backup(2AM), event_discovery(2:30AM), podcast_monitor(2:45AM), event_classify(3AM), content_triage(3:05AM), content_ingest(3:15AM), needs_fetch_retriage(3:20AM), content_extract(3:30AM), calendar_sync(5AM), score_update(5:15AM), cadence_check(5:30AM), daily_briefing(6AM), meeting_prep(6:15AM), pathway_scorer(Sun 3AM), intel_brief(Sun midnight)')
}
