import { PrismaClient } from '@prisma/client'
import { runDiscovery } from '../visibility/discovery-runner'
import { classifyDiscoveredEvents } from '../visibility/classify-events'
import { triageIntelContent, retriageNeedsFetch } from '../visibility/content-triage'
import { fetchIntelContent } from '../visibility/content-fetcher'
import { extractIntelContent } from '../visibility/content-extractor'
import { generateIntelBrief } from '../visibility/intel-brief'

export async function runEventDiscovery(prisma: PrismaClient) {
  console.log('[EventDiscovery] Starting source scraping...')
  const discoveryStats = await runDiscovery(prisma)
  console.log(`[EventDiscovery] Scraping complete: ${discoveryStats.sourcesProcessed} sources, ${discoveryStats.totalDiscovered} new events`)

  if (discoveryStats.errors.length > 0) {
    console.log(`[EventDiscovery] Errors: ${discoveryStats.errors.map(e => `${e.sourceName}: ${e.error}`).join('; ')}`)
  }

  return discoveryStats
}

export async function runEventClassification(prisma: PrismaClient) {
  console.log('[EventClassification] Starting classification...')

  let totalClassified = 0
  let totalDismissed = 0
  let totalErrors = 0

  let hasMore = true
  while (hasMore) {
    const result = await classifyDiscoveredEvents(prisma, 10)
    totalClassified += result.classified
    totalDismissed += result.dismissed
    totalErrors += result.errors
    hasMore = (result.classified + result.dismissed + result.errors) > 0
  }

  console.log(`[EventClassification] Complete: ${totalClassified} classified, ${totalDismissed} dismissed, ${totalErrors} errors`)
  return { classified: totalClassified, dismissed: totalDismissed, errors: totalErrors }
}

export async function runContentTriage(prisma: PrismaClient) {
  console.log('[ContentTriage] Starting Intel content triage...')
  const result = await triageIntelContent(prisma)
  console.log(`[ContentTriage] Complete: ${result.triaged} triaged, ${result.filtered} filtered, ${result.stale} stale, ${result.deduped} deduped, ${result.needsFetch} needs_fetch, ${result.errors} errors`)
  return result
}

export async function runNeedsFetchRetriage(prisma: PrismaClient) {
  console.log('[ContentTriage] Re-triaging needs_fetch items...')
  const result = await retriageNeedsFetch(prisma)
  console.log(`[ContentTriage] Re-triage: ${result.triaged} triaged, ${result.filtered} filtered, ${result.errors} errors`)
  return result
}

export async function runContentIngestion(prisma: PrismaClient) {
  console.log('[ContentIngestion] Starting full-text fetch...')
  const result = await fetchIntelContent(prisma)
  console.log(`[ContentIngestion] Complete: ${result.fetched} fetched, ${result.skipped} skipped, ${result.errors} errors`)
  return result
}

export async function runContentExtraction(prisma: PrismaClient) {
  console.log('[ContentExtraction] Starting intelligence extraction...')
  const result = await extractIntelContent(prisma)
  console.log(`[ContentExtraction] Complete: ${result.extracted} extracted, ${result.empty} empty, ${result.errors} errors`)
  return result
}

export async function runIntelBriefGeneration(prisma: PrismaClient) {
  console.log('[IntelBrief] Generating weekly brief...')
  const result = await generateIntelBrief(prisma)
  console.log(`[IntelBrief] Brief for ${result.weekStart}: ${result.extractionCount} extractions`)
  return result
}
