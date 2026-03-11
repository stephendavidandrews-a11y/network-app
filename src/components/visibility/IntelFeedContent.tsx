'use client'

import { useState, useEffect, useCallback } from 'react'
import { FileText, Search, RefreshCw, AlertTriangle, User, Calendar, TrendingUp, ChevronDown, ChevronRight, ExternalLink, ThumbsDown, ArrowUpCircle, Filter } from 'lucide-react'

interface ContentItem {
  id: string
  sourceType: string
  title: string
  publication: string | null
  publishedAt: string | null
  sourceUrl: string | null
  wordCount: number
  ingestionStatus: string
  summary: string | null
  topicRelevanceScore: number
  topicTags: string[]
  createdAt: string
  extractionCount: number
}

interface Extraction {
  id: string
  extractionType: string
  summary: string
  rawQuote: string | null
  discoveredName: string | null
  discoveredTitle: string | null
  discoveredOrg: string | null
  discoveredContext: string | null
  topic: string | null
  position: string | null
  createdAt: string
  contentItem: {
    title: string
    publication: string | null
    publishedAt: string | null
    sourceUrl: string | null
    topicRelevanceScore: number
  }
}

interface IntelBrief {
  id: string
  weekStart: string
  weekEnd: string
  content: string
  contentStats: Record<string, number>
  generatedAt: string
}

interface FilteredItem {
  id: string
  title: string
  description: string | null
  url: string | null
  source: string
  category: string
  score: number | null
  reason: string | null
  scrapedAt: string
}

interface PipelineStats {
  queued: number
  filtered: number
  fetched: number
  extracted: number
  extractions: number
  needsFetch: number
}

type Tab = 'feed' | 'extractions' | 'briefs' | 'filtered'

function formatDate(dateStr: string | null): string {
  if (!dateStr) return ''
  try {
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return dateStr
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch { return dateStr }
}

function formatDateShort(dateStr: string | null): string {
  if (!dateStr) return ''
  try {
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return dateStr
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  } catch { return dateStr }
}

const EXTRACTION_TYPE_LABELS: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  regulatory_signal: { label: 'Regulatory Signal', icon: <AlertTriangle className="h-3.5 w-3.5" />, color: 'text-amber-400 bg-amber-400/10' },
  policy_position: { label: 'Policy Position', icon: <TrendingUp className="h-3.5 w-3.5" />, color: 'text-blue-400 bg-blue-400/10' },
  person_mention: { label: 'Person', icon: <User className="h-3.5 w-3.5" />, color: 'text-emerald-400 bg-emerald-400/10' },
  event_upcoming: { label: 'Upcoming', icon: <Calendar className="h-3.5 w-3.5" />, color: 'text-purple-400 bg-purple-400/10' },
  event_occurred: { label: 'Occurred', icon: <Calendar className="h-3.5 w-3.5" />, color: 'text-violet-400 bg-violet-400/10' },
  market_data: { label: 'Market Data', icon: <TrendingUp className="h-3.5 w-3.5" />, color: 'text-cyan-400 bg-cyan-400/10' },
  analytical_insight: { label: 'Insight', icon: <FileText className="h-3.5 w-3.5" />, color: 'text-slate-200 bg-slate-400/10' },
}

const SOURCE_CATEGORY_STYLE: Record<string, { bg: string; text: string; border: string }> = {
  government_core:     { bg: 'bg-red-500/15',    text: 'text-red-300',    border: 'border-l-red-500' },
  government_adjacent: { bg: 'bg-rose-500/12',   text: 'text-rose-300',   border: 'border-l-rose-400' },
  government:          { bg: 'bg-red-500/12',    text: 'text-red-300',    border: 'border-l-red-400' },
  law_firm:            { bg: 'bg-blue-500/15',   text: 'text-blue-300',   border: 'border-l-blue-500' },
  academic:            { bg: 'bg-violet-500/15', text: 'text-violet-300', border: 'border-l-violet-500' },
  legal:               { bg: 'bg-cyan-500/15',   text: 'text-cyan-300',   border: 'border-l-cyan-500' },
  think_tank:          { bg: 'bg-amber-500/15',  text: 'text-amber-300',  border: 'border-l-amber-500' },
  industry_advocacy:   { bg: 'bg-orange-500/15', text: 'text-orange-300', border: 'border-l-orange-500' },
  news:                { bg: 'bg-emerald-500/15',text: 'text-emerald-300',border: 'border-l-emerald-500' },
  industry:            { bg: 'bg-orange-500/12', text: 'text-orange-300', border: 'border-l-orange-400' },
  podcast:             { bg: 'bg-pink-500/15',   text: 'text-pink-300',   border: 'border-l-pink-500' },
  local:               { bg: 'bg-slate-500/15',  text: 'text-slate-300',  border: 'border-l-slate-500' },
}

function getSourceStyle(sourceType: string) {
  return SOURCE_CATEGORY_STYLE[sourceType] || { bg: 'bg-slate-500/10', text: 'text-slate-200', border: 'border-l-slate-600' }
}

function ScoreDot({ score }: { score: number }) {
  const color = score >= 8 ? 'bg-emerald-400' : score >= 6 ? 'bg-blue-400' : score >= 4 ? 'bg-amber-400' : 'bg-slate-600'
  const textColor = score >= 8 ? 'text-emerald-300' : score >= 6 ? 'text-blue-300' : score >= 4 ? 'text-amber-300' : 'text-slate-400'
  return (
    <div className="flex items-center gap-1.5" title={`Relevance: ${score}/10`}>
      <div className={`w-2 h-2 rounded-full ${color}`} />
      <span className={`text-xs font-medium tabular-nums ${textColor}`}>{score}</span>
    </div>
  )
}

export function IntelFeedContent() {
  const [tab, setTab] = useState<Tab>('feed')
  const [items, setItems] = useState<ContentItem[]>([])
  const [extractions, setExtractions] = useState<Extraction[]>([])
  const [briefs, setBriefs] = useState<IntelBrief[]>([])
  const [filteredItems, setFilteredItems] = useState<FilteredItem[]>([])
  const [filteredTotal, setFilteredTotal] = useState(0)
  const [pipeline, setPipeline] = useState<PipelineStats>({ queued: 0, filtered: 0, fetched: 0, extracted: 0, extractions: 0, needsFetch: 0 })
  const [typeStats, setTypeStats] = useState<Record<string, number>>({})
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [ingesting, setIngesting] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [generatingBrief, setGeneratingBrief] = useState(false)
  const [expandedItem, setExpandedItem] = useState<string | null>(null)
  const [filterType, setFilterType] = useState<string>('')
  const [filterStatus, setFilterStatus] = useState<string>('')
  const [filterMinScore, setFilterMinScore] = useState<string>('')
  const [message, setMessage] = useState<string | null>(null)

  const fetchFeed = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filterMinScore) params.set('minScore', filterMinScore)
      if (filterStatus) params.set('ingestionStatus', filterStatus)
      params.set('limit', '100')
      const res = await fetch('/api/visibility/content?' + params.toString())
      const data = await res.json()
      setItems(data.items || [])
      setPipeline(data.pipeline || { queued: 0, filtered: 0, fetched: 0, extracted: 0, extractions: 0, needsFetch: 0 })
      setTotal(data.total || 0)
    } catch (error) { console.error('Failed to fetch feed:', error) }
    setLoading(false)
  }, [filterMinScore, filterStatus])

  const fetchExtractions = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filterType) params.set('type', filterType)
      params.set('limit', '200')
      const res = await fetch('/api/visibility/extractions?' + params.toString())
      const data = await res.json()
      setExtractions(data.extractions || [])
      setTypeStats(data.typeStats || {})
    } catch (error) { console.error('Failed to fetch extractions:', error) }
    setLoading(false)
  }, [filterType])

  const fetchBriefs = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/visibility/intel-brief')
      const data = await res.json()
      setBriefs(data.briefs || [])
    } catch (error) { console.error('Failed to fetch briefs:', error) }
    setLoading(false)
  }, [])

  const fetchFiltered = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/intel/filtered?days=7&limit=100')
      const data = await res.json()
      setFilteredItems(data.items || [])
      setFilteredTotal(data.total || 0)
    } catch (error) { console.error('Failed to fetch filtered:', error) }
    setLoading(false)
  }, [])

  useEffect(() => {
    if (tab === 'feed') fetchFeed()
    else if (tab === 'extractions') fetchExtractions()
    else if (tab === 'briefs') fetchBriefs()
    else if (tab === 'filtered') fetchFiltered()
  }, [tab, fetchFeed, fetchExtractions, fetchBriefs, fetchFiltered])

  const handleIngest = async () => {
    setIngesting(true); setMessage(null)
    try {
      const res = await fetch('/api/visibility/content/ingest', { method: 'POST' })
      const data = await res.json()
      setMessage(data.message || 'Ingestion complete')
      fetchFeed()
    } catch (error) { setMessage('Ingestion failed: ' + String(error)) }
    setIngesting(false)
  }

  const handleExtract = async () => {
    setExtracting(true); setMessage(null)
    try {
      const res = await fetch('/api/visibility/content/extract', { method: 'POST' })
      const data = await res.json()
      setMessage(data.message || 'Extraction complete')
      if (tab === 'feed') fetchFeed()
      else if (tab === 'extractions') fetchExtractions()
    } catch (error) { setMessage('Extraction failed: ' + String(error)) }
    setExtracting(false)
  }

  const handleGenerateBrief = async () => {
    setGeneratingBrief(true); setMessage(null)
    try {
      const res = await fetch('/api/visibility/intel-brief', { method: 'POST' })
      const data = await res.json()
      setMessage(data.message || 'Brief generated')
      fetchBriefs()
    } catch (error) { setMessage('Brief generation failed: ' + String(error)) }
    setGeneratingBrief(false)
  }

  const handleThumbsDown = async (itemId: string) => {
    try {
      await fetch('/api/intel/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contentItemId: itemId, feedbackType: 'false_positive' }),
      })
      setMessage('Flagged as noise')
    } catch { setMessage('Failed to record feedback') }
  }

  const handleShouldHavePassed = async (item: FilteredItem) => {
    try {
      await fetch('/api/intel/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ discoveredEventId: item.id, feedbackType: 'false_negative' }),
      })
      setMessage(`Re-queued for ingestion`)
      setFilteredItems(prev => prev.filter(i => i.id !== item.id))
    } catch { setMessage('Failed to record feedback') }
  }

  const totalProcessed = pipeline.filtered + pipeline.fetched + pipeline.extracted + pipeline.needsFetch
  const passRate = totalProcessed > 0 ? Math.round(((pipeline.fetched + pipeline.extracted) / totalProcessed) * 100) : 0

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Intel Feed</h1>
          <p className="text-sm text-slate-400 mt-1">
            {pipeline.extractions > 0
              ? <>{pipeline.extractions} extractions from {pipeline.extracted + pipeline.fetched} articles</>
              : <>{pipeline.fetched + pipeline.extracted} articles in pipeline</>}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleIngest} disabled={ingesting}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-sm font-medium text-white disabled:opacity-50 transition-all active:scale-95">
            <RefreshCw className={`h-3.5 w-3.5 ${ingesting ? 'animate-spin' : ''}`} />
            {ingesting ? 'Ingesting...' : pipeline.queued > 0 ? `Ingest (${pipeline.queued})` : 'Ingest'}
          </button>
          <button onClick={handleExtract} disabled={extracting || pipeline.fetched === 0}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-sm font-medium text-white disabled:opacity-50 transition-all active:scale-95">
            <Search className={`h-3.5 w-3.5 ${extracting ? 'animate-spin' : ''}`} />
            {extracting ? 'Extracting...' : pipeline.fetched > 0 ? `Extract (${pipeline.fetched})` : 'Extract'}
          </button>
        </div>
      </div>

      {message && (
        <div className="mb-4 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-sm text-blue-300 flex items-center justify-between">
          <span>{message}</span>
          <button onClick={() => setMessage(null)} className="text-blue-400 hover:text-blue-300 ml-2 text-xs">dismiss</button>
        </div>
      )}

      {/* Pipeline summary — compact horizontal strip */}
      <div className="mb-6 p-3 rounded-lg bg-[#1a1f2e] border border-slate-700/40">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6 text-xs">
            <div className="flex items-center gap-4">
              <span className="text-slate-400 font-medium uppercase tracking-wider" style={{ fontSize: '10px' }}>Pipeline</span>
              {pipeline.queued > 0 && (
                <span className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                  <span className="text-slate-200 tabular-nums">{pipeline.queued}</span>
                  <span className="text-slate-500">queued</span>
                </span>
              )}
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                <span className="text-amber-300 tabular-nums">{pipeline.fetched}</span>
                <span className="text-slate-500">fetched</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <span className="text-emerald-300 tabular-nums">{pipeline.extracted}</span>
                <span className="text-slate-500">extracted</span>
              </span>
              {pipeline.needsFetch > 0 && (
                <span className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-orange-400" />
                  <span className="text-orange-300 tabular-nums">{pipeline.needsFetch}</span>
                  <span className="text-slate-500">vague</span>
                </span>
              )}
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-600" />
                <span className="text-slate-400 tabular-nums">{pipeline.filtered}</span>
                <span className="text-slate-500">filtered</span>
              </span>
            </div>
          </div>
          {totalProcessed > 0 && (
            <span className="text-[11px] text-slate-400 tabular-nums">{passRate}% pass rate</span>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-slate-700/40">
        {([
          { id: 'feed' as Tab, label: 'Feed', count: pipeline.extracted + pipeline.fetched },
          { id: 'extractions' as Tab, label: 'Extractions', count: pipeline.extractions },
          { id: 'briefs' as Tab, label: 'Weekly Brief' },
          { id: 'filtered' as Tab, label: 'Filtered', count: filteredTotal || undefined },
        ]).map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === t.id ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-400 hover:text-slate-300'
            }`}>
            {t.label}
            {t.count !== undefined && t.count > 0 && (
              <span className={`ml-1.5 text-xs ${tab === t.id ? 'text-blue-500' : 'text-slate-500'}`}>{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <RefreshCw className="h-5 w-5 animate-spin text-slate-500" />
          <span className="ml-3 text-slate-400 text-sm">Loading...</span>
        </div>
      ) : tab === 'feed' ? (
        <FeedTab items={items} expandedItem={expandedItem} setExpandedItem={setExpandedItem}
          filterStatus={filterStatus} setFilterStatus={setFilterStatus}
          filterMinScore={filterMinScore} setFilterMinScore={setFilterMinScore}
          handleThumbsDown={handleThumbsDown} />
      ) : tab === 'extractions' ? (
        <ExtractionsTab extractions={extractions} typeStats={typeStats}
          filterType={filterType} setFilterType={setFilterType} />
      ) : tab === 'briefs' ? (
        <BriefsTab briefs={briefs} generatingBrief={generatingBrief} handleGenerateBrief={handleGenerateBrief} />
      ) : tab === 'filtered' ? (
        <FilteredTab items={filteredItems} handleShouldHavePassed={handleShouldHavePassed} />
      ) : null}
    </div>
  )
}

// ═══ FEED TAB ═══
function FeedTab({ items, expandedItem, setExpandedItem, filterStatus, setFilterStatus, filterMinScore, setFilterMinScore, handleThumbsDown }: {
  items: ContentItem[]; expandedItem: string | null; setExpandedItem: (id: string | null) => void
  filterStatus: string; setFilterStatus: (s: string) => void; filterMinScore: string; setFilterMinScore: (s: string) => void
  handleThumbsDown: (id: string) => void
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <Filter className="h-3.5 w-3.5 text-slate-500" />
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="bg-[#232838] border border-slate-700/50 rounded-lg px-3 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-slate-600">
          <option value="">All statuses</option>
          <option value="extracted">Extracted</option>
          <option value="fetched">Awaiting extraction</option>
        </select>
        <select value={filterMinScore} onChange={e => setFilterMinScore(e.target.value)}
          className="bg-[#232838] border border-slate-700/50 rounded-lg px-3 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-slate-600">
          <option value="">All scores</option>
          <option value="8">8+ High relevance</option>
          <option value="6">6+ Medium+</option>
          <option value="4">4+ Low+</option>
        </select>
      </div>

      {items.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No content items yet. Click &quot;Ingest&quot; to start the pipeline.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map(item => {
            const style = getSourceStyle(item.sourceType)
            return (
              <div key={item.id} className={`rounded-lg border border-slate-700/40 overflow-hidden bg-[#1e2433] hover:bg-[#1e2433] transition-colors border-l-2 ${style.border}`}>
                <button onClick={() => setExpandedItem(expandedItem === item.id ? null : item.id)}
                  className="w-full text-left p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2.5 mb-1.5">
                        <span className={`inline-flex px-2 py-0.5 rounded text-[11px] font-medium ${style.bg} ${style.text}`}>
                          {item.publication || item.sourceType}
                        </span>
                        <span className="text-[11px] text-slate-400">{formatDate(item.publishedAt)}</span>
                        <ScoreDot score={item.topicRelevanceScore} />
                        {item.ingestionStatus === 'fetched' && (
                          <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-500/70">pending extraction</span>
                        )}
                      </div>
                      <h3 className="text-sm font-medium text-slate-200 leading-snug">{item.title}</h3>
                      {item.summary && (
                        <p className="text-xs text-slate-400 mt-1.5 line-clamp-2 leading-relaxed">{item.summary}</p>
                      )}
                      {(item.topicTags.length > 0 || item.extractionCount > 0) && (
                        <div className="flex items-center gap-1.5 mt-2">
                          {item.topicTags.slice(0, 4).map((tag: string) => (
                            <span key={tag} className="text-[11px] px-1.5 py-0.5 rounded-full bg-slate-700/40 text-slate-400">{tag}</span>
                          ))}
                          {item.extractionCount > 0 && (
                            <span className="text-[11px] text-emerald-500/70 ml-1">{item.extractionCount} extraction{item.extractionCount !== 1 ? 's' : ''}</span>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
                      {item.sourceUrl && (
                        <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                          className="p-1.5 rounded-md text-slate-500 hover:text-slate-300 hover:bg-slate-700/50 transition-colors">
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                      <button onClick={e => { e.stopPropagation(); handleThumbsDown(item.id) }} title="Flag as noise"
                        className="p-1.5 rounded-md text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors">
                        <ThumbsDown className="h-3.5 w-3.5" />
                      </button>
                      {expandedItem === item.id
                        ? <ChevronDown className="h-4 w-4 text-slate-500" />
                        : <ChevronRight className="h-4 w-4 text-slate-500" />}
                    </div>
                  </div>
                </button>
                {expandedItem === item.id && <ItemExtractions itemId={item.id} />}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ═══ EXTRACTIONS TAB ═══
function ExtractionsTab({ extractions, typeStats, filterType, setFilterType }: {
  extractions: Extraction[]; typeStats: Record<string, number>; filterType: string; setFilterType: (s: string) => void
}) {
  return (
    <div>
      <div className="flex gap-2 mb-5 flex-wrap">
        <button onClick={() => setFilterType('')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${!filterType ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' : 'bg-[#232838] text-slate-200 hover:text-slate-200'}`}>
          All ({Object.values(typeStats).reduce((a, b) => a + b, 0)})
        </button>
        {Object.entries(EXTRACTION_TYPE_LABELS).map(([type, config]) => (
          <button key={type} onClick={() => setFilterType(type)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              filterType === type ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' : `${config.color} hover:opacity-80`
            }`}>
            {config.icon} {config.label} ({typeStats[type] || 0})
          </button>
        ))}
      </div>
      {extractions.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <Search className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No extractions yet. Fetch and extract articles first.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {extractions.map(ext => {
            const config = EXTRACTION_TYPE_LABELS[ext.extractionType] || EXTRACTION_TYPE_LABELS.topic_analysis
            return (
              <div key={ext.id} className="bg-[#1e2433] rounded-lg border border-slate-700/40 p-4 hover:bg-[#1e2433] transition-colors">
                <div className="flex items-start gap-3">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium shrink-0 mt-0.5 ${config.color}`}>
                    {config.icon} {config.label}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[15px] text-slate-200 leading-relaxed">{ext.summary}</p>
                    {ext.rawQuote && (
                      <p className="text-xs text-slate-400 mt-2 italic border-l-2 border-slate-700 pl-3 leading-relaxed">
                        &quot;{ext.rawQuote.substring(0, 200)}&quot;
                      </p>
                    )}
                    {ext.discoveredName && (
                      <div className="flex items-center gap-2 mt-2 text-xs text-emerald-400/80">
                        <User className="h-3 w-3" /> <span className="font-medium">{ext.discoveredName}</span>
                        {ext.discoveredTitle && <span className="text-slate-400">{ext.discoveredTitle}</span>}
                        {ext.discoveredOrg && <span className="text-slate-400">at {ext.discoveredOrg}</span>}
                      </div>
                    )}
                    {ext.position && (
                      <span className={`inline-block mt-2 text-[11px] px-2 py-0.5 rounded-full font-medium ${
                        ext.position.toLowerCase().includes('support') ? 'bg-emerald-500/10 text-emerald-400' :
                        ext.position.toLowerCase().includes('critical') || ext.position.toLowerCase().includes('oppos') ? 'bg-red-500/10 text-red-400' :
                        'bg-slate-600/20 text-slate-200'
                      }`}>{ext.position}</span>
                    )}
                    <div className="flex items-center gap-3 mt-2.5 text-[11px] text-slate-400">
                      <span>{ext.contentItem.publication}</span>
                      {ext.contentItem.publishedAt && <span>{formatDateShort(ext.contentItem.publishedAt)}</span>}
                      {ext.topic && <span className="px-1.5 py-0.5 rounded-full bg-slate-700/40 text-slate-400">{ext.topic}</span>}
                      {ext.contentItem.sourceUrl && (
                        <a href={ext.contentItem.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-slate-500 hover:text-slate-300 transition-colors">
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ═══ BRIEFS TAB ═══
function BriefsTab({ briefs, generatingBrief, handleGenerateBrief }: {
  briefs: IntelBrief[]; generatingBrief: boolean; handleGenerateBrief: () => void
}) {
  return (
    <div>
      <div className="flex justify-end mb-4">
        <button onClick={handleGenerateBrief} disabled={generatingBrief}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-sm font-medium text-white disabled:opacity-50 transition-all active:scale-95">
          <FileText className={`h-3.5 w-3.5 ${generatingBrief ? 'animate-spin' : ''}`} />
          {generatingBrief ? 'Generating...' : 'Generate Brief'}
        </button>
      </div>
      {briefs.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No weekly briefs yet. Click &quot;Generate Brief&quot; to create one.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {briefs.map(brief => (
            <div key={brief.id} className="bg-[#232838] rounded-lg border border-slate-700/50 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-slate-200">Week of {formatDateShort(brief.weekStart)} &mdash; {formatDateShort(brief.weekEnd)}</h3>
                <div className="flex gap-2 text-[11px] text-slate-200">
                  {Object.entries(brief.contentStats).map(([key, val]) => (
                    <span key={key} className="px-2 py-0.5 rounded-full bg-slate-700/60 text-slate-300">{key}: {val}</span>
                  ))}
                </div>
              </div>
              <BriefContent content={brief.content} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ═══ FILTERED TAB ═══
function FilteredTab({ items, handleShouldHavePassed }: {
  items: FilteredItem[]; handleShouldHavePassed: (item: FilteredItem) => void
}) {
  return (
    <div>
      <p className="text-xs text-slate-400 mb-4">
        Recently filtered articles (last 7 days). Flag any that should have passed triage.
      </p>
      {items.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <Filter className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No filtered items in the last 7 days.</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {items.map(item => (
            <div key={item.id} className="rounded-lg border border-slate-700/30 bg-[#1a1f2e] p-3 flex items-center gap-3 hover:bg-[#1a1f2e] transition-colors">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-slate-700/40 text-slate-400">{item.source}</span>
                  <span className="text-[11px] text-slate-500">{item.category}</span>
                  {item.score !== null && (
                    <span className="text-[11px] font-mono text-slate-500">{item.score}/10</span>
                  )}
                  <span className="text-[11px] text-slate-700">{formatDateShort(item.scrapedAt)}</span>
                </div>
                <p className="text-xs text-slate-200 truncate">{item.title}</p>
                {item.reason && <p className="text-[11px] text-slate-500 mt-0.5 truncate">{item.reason}</p>}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {item.url && (
                  <a href={item.url} target="_blank" rel="noopener noreferrer"
                    className="p-1.5 rounded-md text-slate-500 hover:text-slate-300 hover:bg-slate-700/50 transition-colors">
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
                <button onClick={() => handleShouldHavePassed(item)} title="Should have passed triage"
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors">
                  <ArrowUpCircle className="h-3 w-3" /> Restore
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ═══ SUB-COMPONENTS ═══
function ItemExtractions({ itemId }: { itemId: string }) {
  const [extractions, setExtractions] = useState<Extraction[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/visibility/content/${itemId}`)
      .then(res => res.json())
      .then(data => { setExtractions(data.extractions || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [itemId])

  if (loading) return <div className="px-4 pb-4 text-xs text-slate-500">Loading extractions...</div>
  if (extractions.length === 0) return <div className="px-4 pb-4 text-xs text-slate-500">No extractions yet</div>

  return (
    <div className="border-t border-slate-700/30 px-4 py-3 space-y-2 bg-[#151a27]">
      <div className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold mb-1">Extractions</div>
      {extractions.map((ext: Extraction) => {
        const config = EXTRACTION_TYPE_LABELS[ext.extractionType] || EXTRACTION_TYPE_LABELS.topic_analysis
        return (
          <div key={ext.id} className="flex items-start gap-2">
            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium shrink-0 ${config.color}`}>{config.icon}</span>
            <div className="text-xs text-slate-200 leading-relaxed">
              <span className="text-slate-300">{ext.summary}</span>
              {ext.discoveredName && <span className="text-emerald-400/60 ml-1">({ext.discoveredName})</span>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function BriefContent({ content }: { content: string }) {
  const lines = content.split('\n')
  return (
    <div className="space-y-1 prose-sm">
      {lines.map((line, i) => {
        if (line.startsWith('## ')) return <h2 key={i} className="text-base font-semibold text-blue-400 mt-5 mb-2">{line.replace('## ', '')}</h2>
        if (line.startsWith('### ')) return <h3 key={i} className="text-sm font-semibold text-slate-300 mt-4 mb-1">{line.replace('### ', '')}</h3>
        if (line.startsWith('- ') || line.startsWith('* ')) return <li key={i} className="text-[15px] text-slate-200 ml-4 list-disc leading-relaxed">{line.replace(/^[-*] /, '')}</li>
        if (line.startsWith('**') && line.endsWith('**')) return <p key={i} className="text-sm font-semibold text-slate-200 mt-2">{line.replace(/\*\*/g, '')}</p>
        if (line.trim() === '') return <div key={i} className="h-2" />
        return <p key={i} className="text-[15px] text-slate-200 leading-relaxed">{line}</p>
      })}
    </div>
  )
}
