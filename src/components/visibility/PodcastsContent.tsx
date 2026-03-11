'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Podcast, Search, RefreshCw, Plus, ExternalLink, Radio, Mic,
  Clock, TrendingUp, ChevronDown, ChevronRight, X, Play, Users,
  Target, Filter, ArrowUpRight, Calendar
} from 'lucide-react'

// --- Types ---
interface PodcastShow {
  id: string
  name: string
  host: string | null
  hostContactId: string | null
  hostContact: { id: string; name: string } | null
  producerName: string | null
  producerContactId: string | null
  producerContact: { id: string; name: string } | null
  producerEmail: string | null
  pitchEmail: string | null
  rssFeedUrl: string | null
  websiteUrl: string | null
  audienceDescription: string | null
  audienceSize: string | null
  topicAlignment: number
  tier: number
  status: string
  lastEpisodeMonitoredAt: string | null
  notes: string | null
  createdAt: string
  episodeCount: number
  outreachCount: number
  latestEpisodeDate: string | null
  activePitchWindows: number
}

interface Episode {
  id: string
  podcastId: string
  title: string
  description: string | null
  episodeUrl: string | null
  audioUrl: string | null
  publishedAt: string | null
  durationMinutes: number | null
  ingestionStatus: string
  topicRelevanceScore: number
  topicTags: string[]
  isPitchWindow: boolean
  pitchWindowExpiresAt: string | null
  triageStatus: string
  guestNames: string[]
  guestExtractions: string | null
}

type Tab = 'shows' | 'pitch' | 'pipeline'

// --- Helpers ---
function formatDate(dateStr: string | null): string {
  if (!dateStr) return ''
  try {
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return dateStr
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch { return dateStr || '' }
}

function daysRemaining(expiresAt: string | null): number | null {
  if (!expiresAt) return null
  const diff = new Date(expiresAt).getTime() - Date.now()
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)))
}

const TIER_COLORS: Record<number, { bg: string; text: string; label: string }> = {
  1: { bg: 'bg-red-500/20', text: 'text-red-400', label: 'T1' },
  2: { bg: 'bg-amber-500/20', text: 'text-amber-400', label: 'T2' },
  3: { bg: 'bg-blue-500/20', text: 'text-blue-400', label: 'T3' },
}

const STATUS_COLORS: Record<string, string> = {
  monitoring: 'text-emerald-400 bg-emerald-400/10',
  researching: 'text-blue-400 bg-blue-400/10',
  warm_intro: 'text-purple-400 bg-purple-400/10',
  pitched: 'text-amber-400 bg-amber-400/10',
  booked: 'text-green-400 bg-green-400/10',
  recorded: 'text-cyan-400 bg-cyan-400/10',
  aired: 'text-teal-400 bg-teal-400/10',
  dormant: 'text-slate-500 bg-slate-500/10',
}

const PIPELINE_STAGES = [
  'monitoring', 'researching', 'warm_intro', 'pitched', 'booked', 'recorded', 'aired'
]

// ==============================
// MAIN COMPONENT
// ==============================
export function PodcastsContent() {
  const [tab, setTab] = useState<Tab>('shows')
  const [podcasts, setPodcasts] = useState<PodcastShow[]>([])
  const [pitchEpisodes, setPitchEpisodes] = useState<(Episode & { podcastName: string; podcastTier: number })[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [search, setSearch] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [expandedEpisodes, setExpandedEpisodes] = useState<Episode[]>([])
  const [showAddForm, setShowAddForm] = useState(false)
  const [tierFilter, setTierFilter] = useState<number | null>(null)
  const [pollingSingle, setPollingSingle] = useState<string | null>(null)

  // --- Fetch podcasts ---
  const fetchPodcasts = useCallback(async () => {
    try {
      const res = await fetch('/api/visibility/podcasts')
      if (res.ok) {
        const data = await res.json()
        setPodcasts(data)
      }
    } catch (e) {
      console.error('Failed to fetch podcasts:', e)
    }
  }, [])

  // --- Fetch pitch window episodes ---
  const fetchPitchWindows = useCallback(async () => {
    try {
      // Get all podcasts, then fetch episodes with pitch windows for each
      const res = await fetch('/api/visibility/podcasts')
      if (!res.ok) return
      const shows: PodcastShow[] = await res.json()

      const allPitchEps: (Episode & { podcastName: string; podcastTier: number })[] = []
      for (const show of shows) {
        if (show.activePitchWindows === 0) continue
        const epRes = await fetch(`/api/visibility/podcasts/${show.id}/episodes?isPitchWindow=true&limit=20`)
        if (!epRes.ok) continue
        const { episodes } = await epRes.json()
        for (const ep of episodes) {
          const days = daysRemaining(ep.pitchWindowExpiresAt)
          if (days !== null && days > 0) {
            allPitchEps.push({ ...ep, podcastName: show.name, podcastTier: show.tier })
          }
        }
      }
      allPitchEps.sort((a, b) => (b.topicRelevanceScore || 0) - (a.topicRelevanceScore || 0))
      setPitchEpisodes(allPitchEps)
    } catch (e) {
      console.error('Failed to fetch pitch windows:', e)
    }
  }, [])

  // --- Initial load ---
  useEffect(() => {
    setLoading(true)
    Promise.all([fetchPodcasts(), fetchPitchWindows()]).finally(() => setLoading(false))
  }, [fetchPodcasts, fetchPitchWindows])

  // --- Refresh ---
  const handleRefresh = async () => {
    setRefreshing(true)
    await Promise.all([fetchPodcasts(), fetchPitchWindows()])
    setRefreshing(false)
  }

  // --- Expand podcast detail ---
  const toggleExpand = async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null)
      setExpandedEpisodes([])
      return
    }
    setExpandedId(id)
    try {
      const res = await fetch(`/api/visibility/podcasts/${id}/episodes?limit=15`)
      if (res.ok) {
        const { episodes } = await res.json()
        setExpandedEpisodes(episodes)
      }
    } catch { setExpandedEpisodes([]) }
  }

  // --- Poll single podcast ---
  const pollPodcast = async (id: string) => {
    setPollingSingle(id)
    try {
      await fetch(`/api/visibility/podcasts/${id}/monitor`, { method: 'POST' })
      await fetchPodcasts()
      if (expandedId === id) {
        const res = await fetch(`/api/visibility/podcasts/${id}/episodes?limit=15`)
        if (res.ok) {
          const { episodes } = await res.json()
          setExpandedEpisodes(episodes)
        }
      }
    } catch (e) {
      console.error('Poll failed:', e)
    }
    setPollingSingle(null)
  }

  // --- Add podcast ---
  const handleAddPodcast = async (formData: Record<string, string>) => {
    try {
      const res = await fetch('/api/visibility/podcasts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          host: formData.host || null,
          rssFeedUrl: formData.rssFeedUrl || null,
          tier: parseInt(formData.tier) || 2,
          notes: formData.notes || null,
        }),
      })
      if (res.ok) {
        setShowAddForm(false)
        await fetchPodcasts()
      }
    } catch (e) {
      console.error('Add failed:', e)
    }
  }

  // --- Update podcast status ---
  const updateStatus = async (id: string, status: string) => {
    try {
      await fetch(`/api/visibility/podcasts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      await fetchPodcasts()
    } catch (e) {
      console.error('Status update failed:', e)
    }
  }

  // --- Filtered podcasts ---
  const filtered = podcasts.filter(p => {
    if (tierFilter && p.tier !== tierFilter) return false
    if (search) {
      const q = search.toLowerCase()
      return p.name.toLowerCase().includes(q) || (p.host || '').toLowerCase().includes(q)
    }
    return true
  })

  // --- Tab pills ---
  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: 'shows', label: 'Shows', count: podcasts.length },
    { key: 'pitch', label: 'Pitch Windows', count: pitchEpisodes.length },
    { key: 'pipeline', label: 'Pipeline' },
  ]

  return (
    <div className="min-h-screen bg-[#1e2433] p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Podcast className="h-6 w-6 text-purple-400" />
          <h1 className="text-xl font-semibold text-white">Podcasts</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm text-slate-300 hover:bg-slate-700 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={() => setShowAddForm(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm bg-purple-600 text-white hover:bg-purple-500 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Podcast
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-[#232838] rounded-lg p-1 w-fit">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              tab === t.key
                ? 'bg-slate-700 text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {t.label}
            {t.count !== undefined && (
              <span className={`ml-1.5 text-xs ${tab === t.key ? 'text-slate-300' : 'text-slate-500'}`}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Search + Filter (Shows tab) */}
      {tab === 'shows' && (
        <div className="flex gap-3 mb-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
            <input
              type="text"
              placeholder="Search podcasts..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-md bg-[#232838] border border-slate-700 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-purple-500"
            />
          </div>
          <div className="flex gap-1">
            {[null, 1, 2, 3].map(t => (
              <button
                key={t ?? 'all'}
                onClick={() => setTierFilter(t)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  tierFilter === t
                    ? 'bg-slate-600 text-white'
                    : 'text-slate-400 hover:bg-slate-700'
                }`}
              >
                {t === null ? 'All' : `Tier ${t}`}
              </button>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="h-6 w-6 text-slate-500 animate-spin" />
        </div>
      ) : (
        <>
          {/* ======= SHOWS TAB ======= */}
          {tab === 'shows' && (
            <div className="space-y-2">
              {filtered.length === 0 ? (
                <div className="text-center py-12 text-slate-500">
                  {podcasts.length === 0 ? 'No podcasts yet. Add one to get started.' : 'No podcasts match your filters.'}
                </div>
              ) : (
                filtered.map(p => (
                  <div key={p.id} className="bg-[#232838] rounded-lg border border-slate-700/50">
                    {/* Podcast row */}
                    <button
                      onClick={() => toggleExpand(p.id)}
                      className="w-full flex items-center gap-4 px-4 py-3 text-left hover:bg-slate-700/20 transition-colors rounded-lg"
                    >
                      <div className="flex-shrink-0">
                        {expandedId === p.id ? (
                          <ChevronDown className="h-4 w-4 text-slate-500" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-slate-500" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-slate-100 truncate">{p.name}</span>
                          {/* Tier badge */}
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${TIER_COLORS[p.tier]?.bg || ''} ${TIER_COLORS[p.tier]?.text || 'text-slate-400'}`}>
                            {TIER_COLORS[p.tier]?.label || `T${p.tier}`}
                          </span>
                          {/* Status badge */}
                          <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${STATUS_COLORS[p.status] || 'text-slate-400 bg-slate-400/10'}`}>
                            {p.status.replace('_', ' ')}
                          </span>
                          {/* Active pitch windows */}
                          {p.activePitchWindows > 0 && (
                            <span className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium text-green-400 bg-green-400/10">
                              <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
                              {p.activePitchWindows} pitch {p.activePitchWindows === 1 ? 'window' : 'windows'}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-500">
                          {p.host && <span>Host: {p.host}</span>}
                          <span>{p.episodeCount} episodes</span>
                          {p.latestEpisodeDate && <span>Latest: {formatDate(p.latestEpisodeDate)}</span>}
                        </div>
                      </div>

                      {p.websiteUrl && (
                        <a
                          href={p.websiteUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={e => e.stopPropagation()}
                          className="text-slate-500 hover:text-slate-300"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </button>

                    {/* Expanded detail */}
                    {expandedId === p.id && (
                      <div className="border-t border-slate-700/50 px-4 py-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-4 text-xs text-slate-400">
                            {p.hostContact && (
                              <a href={`/contacts/${p.hostContact.id}`} className="text-blue-400 hover:underline">
                                Host: {p.hostContact.name}
                              </a>
                            )}
                            {p.producerContact && (
                              <a href={`/contacts/${p.producerContact.id}`} className="text-blue-400 hover:underline">
                                Producer: {p.producerContact.name}
                              </a>
                            )}
                            {p.pitchEmail && <span>Pitch: {p.pitchEmail}</span>}
                            {p.rssFeedUrl && <span className="text-emerald-400">RSS active</span>}
                          </div>
                          <div className="flex items-center gap-2">
                            <select
                              value={p.status}
                              onChange={e => updateStatus(p.id, e.target.value)}
                              className="text-xs bg-[#1a1f2e] border border-slate-600 rounded px-2 py-1 text-slate-300"
                            >
                              {PIPELINE_STAGES.map(s => (
                                <option key={s} value={s}>{s.replace('_', ' ')}</option>
                              ))}
                              <option value="dormant">dormant</option>
                            </select>
                            <button
                              onClick={() => pollPodcast(p.id)}
                              disabled={pollingSingle === p.id}
                              className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-slate-700 text-slate-300 hover:bg-slate-600 disabled:opacity-50"
                            >
                              <RefreshCw className={`h-3 w-3 ${pollingSingle === p.id ? 'animate-spin' : ''}`} />
                              Poll RSS
                            </button>
                          </div>
                        </div>

                        {p.notes && (
                          <p className="text-xs text-slate-500 mb-3 italic">{p.notes}</p>
                        )}

                        {/* Episodes list */}
                        <div className="space-y-1.5">
                          <div className="text-xs font-medium text-slate-400 mb-2">Recent Episodes</div>
                          {expandedEpisodes.length === 0 ? (
                            <div className="text-xs text-slate-600 py-4 text-center">No episodes yet. Click &quot;Poll RSS&quot; to fetch.</div>
                          ) : (
                            expandedEpisodes.map(ep => (
                              <div key={ep.id} className="flex items-start gap-3 py-2 px-3 rounded bg-[#1a1f2e]">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs text-slate-200 font-medium truncate">{ep.title}</span>
                                    {ep.isPitchWindow && (
                                      <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium text-green-400 bg-green-400/10">
                                        <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
                                        Pitch
                                      </span>
                                    )}
                                    {ep.triageStatus === 'filtered' && (
                                      <span className="px-1.5 py-0.5 rounded text-[10px] text-slate-600 bg-slate-600/10">filtered</span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-3 mt-0.5 text-[11px] text-slate-500">
                                    {ep.publishedAt && <span>{formatDate(ep.publishedAt)}</span>}
                                    {ep.topicRelevanceScore > 0 && (
                                      <span className={ep.topicRelevanceScore >= 7 ? 'text-amber-400' : ''}>
                                        Score: {ep.topicRelevanceScore}/10
                                      </span>
                                    )}
                                    {ep.durationMinutes && <span>{ep.durationMinutes}m</span>}
                                    {ep.guestNames.length > 0 && (
                                      <span className="text-purple-400">
                                        <Users className="inline h-3 w-3 mr-0.5" />
                                        {ep.guestNames.join(', ')}
                                      </span>
                                    )}
                                  </div>
                                  {ep.topicTags.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mt-1">
                                      {ep.topicTags.slice(0, 5).map((tag, i) => (
                                        <span key={i} className="px-1.5 py-0.5 rounded text-[10px] text-slate-400 bg-slate-700">
                                          {tag}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </div>
                                {ep.episodeUrl && (
                                  <a
                                    href={ep.episodeUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-slate-600 hover:text-slate-400 mt-0.5"
                                  >
                                    <ExternalLink className="h-3 w-3" />
                                  </a>
                                )}
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {/* ======= PITCH WINDOWS TAB ======= */}
          {tab === 'pitch' && (
            <div className="space-y-2">
              {pitchEpisodes.length === 0 ? (
                <div className="text-center py-12 text-slate-500">
                  No active pitch windows. Run the podcast monitor to detect opportunities.
                </div>
              ) : (
                pitchEpisodes.map(ep => {
                  const days = daysRemaining(ep.pitchWindowExpiresAt)
                  let extraction: any = null
                  try {
                    extraction = ep.guestExtractions ? JSON.parse(ep.guestExtractions) : null
                  } catch { /* */ }

                  return (
                    <div key={ep.id} className="bg-[#232838] rounded-lg border border-slate-700/50 px-4 py-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="flex items-center gap-1 text-green-400">
                              <span className="h-2 w-2 rounded-full bg-green-400 animate-pulse" />
                            </span>
                            <span className="text-sm font-medium text-slate-100 truncate">{ep.title}</span>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-slate-400">
                            <span className="text-purple-400 font-medium">{ep.podcastName}</span>
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${TIER_COLORS[ep.podcastTier]?.bg || ''} ${TIER_COLORS[ep.podcastTier]?.text || ''}`}>
                              {TIER_COLORS[ep.podcastTier]?.label || `T${ep.podcastTier}`}
                            </span>
                            {ep.publishedAt && <span>{formatDate(ep.publishedAt)}</span>}
                            <span className={`font-medium ${(days || 0) <= 3 ? 'text-red-400' : (days || 0) <= 7 ? 'text-amber-400' : 'text-green-400'}`}>
                              {days}d remaining
                            </span>
                            <span className={ep.topicRelevanceScore >= 8 ? 'text-amber-400 font-medium' : ''}>
                              Score: {ep.topicRelevanceScore}/10
                            </span>
                          </div>
                          {extraction?.pitchAngle && (
                            <p className="text-xs text-slate-400 mt-2 italic">
                              <Target className="inline h-3 w-3 mr-1 text-green-400" />
                              {extraction.pitchAngle}
                            </p>
                          )}
                          {ep.guestNames.length > 0 && (
                            <div className="flex items-center gap-1.5 mt-1.5">
                              <Users className="h-3 w-3 text-slate-500" />
                              {ep.guestNames.map((name, i) => (
                                <span key={i} className="px-1.5 py-0.5 rounded text-[10px] text-purple-400 bg-purple-400/10">
                                  {name}
                                </span>
                              ))}
                            </div>
                          )}
                          {ep.topicTags.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {ep.topicTags.map((tag, i) => (
                                <span key={i} className="px-1.5 py-0.5 rounded text-[10px] text-slate-400 bg-slate-700">
                                  {tag}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2 ml-4 flex-shrink-0">
                          {ep.episodeUrl && (
                            <a
                              href={ep.episodeUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 px-2 py-1 text-[10px] rounded text-slate-400 hover:text-slate-200 bg-slate-700/50"
                            >
                              <Play className="h-3 w-3" /> Listen
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          )}

          {/* ======= PIPELINE TAB ======= */}
          {tab === 'pipeline' && (
            <div className="overflow-x-auto pb-4">
              <div className="flex gap-3 min-w-max">
                {PIPELINE_STAGES.map(stage => {
                  const stagePodcasts = podcasts.filter(p => p.status === stage)
                  return (
                    <div key={stage} className="w-56 flex-shrink-0">
                      <div className="flex items-center justify-between mb-2 px-2">
                        <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                          {stage.replace('_', ' ')}
                        </span>
                        <span className="text-xs text-slate-600">{stagePodcasts.length}</span>
                      </div>
                      <div className="space-y-2 min-h-[200px] bg-[#1a1f2e] rounded-lg p-2">
                        {stagePodcasts.map(p => (
                          <div
                            key={p.id}
                            className="bg-[#232838] rounded-md border border-slate-700/50 p-3 cursor-pointer hover:border-slate-600 transition-colors"
                            onClick={() => { setTab('shows'); setTimeout(() => toggleExpand(p.id), 100) }}
                          >
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xs font-medium text-slate-200 truncate">{p.name}</span>
                              <span className={`px-1 py-0.5 rounded text-[9px] font-bold ${TIER_COLORS[p.tier]?.bg || ''} ${TIER_COLORS[p.tier]?.text || ''}`}>
                                {TIER_COLORS[p.tier]?.label || `T${p.tier}`}
                              </span>
                            </div>
                            <div className="text-[10px] text-slate-500">
                              {p.host && <div>{p.host}</div>}
                              <div>{p.episodeCount} eps{p.latestEpisodeDate ? ` · ${formatDate(p.latestEpisodeDate)}` : ''}</div>
                            </div>
                            {p.activePitchWindows > 0 && (
                              <div className="flex items-center gap-1 mt-1.5 text-[10px] text-green-400">
                                <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
                                {p.activePitchWindows} pitch window{p.activePitchWindows > 1 ? 's' : ''}
                              </div>
                            )}
                          </div>
                        ))}
                        {stagePodcasts.length === 0 && (
                          <div className="text-center py-8 text-[10px] text-slate-600">
                            No shows
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* ======= ADD FORM MODAL ======= */}
      {showAddForm && <AddPodcastModal onAdd={handleAddPodcast} onClose={() => setShowAddForm(false)} />}
    </div>
  )
}

// ==============================
// ADD PODCAST MODAL
// ==============================
function AddPodcastModal({ onAdd, onClose }: { onAdd: (data: Record<string, string>) => void; onClose: () => void }) {
  const [form, setForm] = useState({ name: '', host: '', rssFeedUrl: '', tier: '2', notes: '' })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) return
    onAdd(form)
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="bg-[#232838] rounded-lg border border-slate-700 p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-white">Add Podcast</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300">
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-xs text-slate-400 block mb-1">Name *</label>
            <input
              type="text"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="w-full px-3 py-2 rounded-md bg-[#1a1f2e] border border-slate-600 text-sm text-slate-200 focus:outline-none focus:border-purple-500"
              placeholder="e.g. Unchained"
            />
          </div>
          <div>
            <label className="text-xs text-slate-400 block mb-1">Host</label>
            <input
              type="text"
              value={form.host}
              onChange={e => setForm(f => ({ ...f, host: e.target.value }))}
              className="w-full px-3 py-2 rounded-md bg-[#1a1f2e] border border-slate-600 text-sm text-slate-200 focus:outline-none focus:border-purple-500"
              placeholder="e.g. Laura Shin"
            />
          </div>
          <div>
            <label className="text-xs text-slate-400 block mb-1">RSS Feed URL</label>
            <input
              type="url"
              value={form.rssFeedUrl}
              onChange={e => setForm(f => ({ ...f, rssFeedUrl: e.target.value }))}
              className="w-full px-3 py-2 rounded-md bg-[#1a1f2e] border border-slate-600 text-sm text-slate-200 focus:outline-none focus:border-purple-500"
              placeholder="https://feeds.example.com/podcast.xml"
            />
          </div>
          <div>
            <label className="text-xs text-slate-400 block mb-1">Tier</label>
            <select
              value={form.tier}
              onChange={e => setForm(f => ({ ...f, tier: e.target.value }))}
              className="w-full px-3 py-2 rounded-md bg-[#1a1f2e] border border-slate-600 text-sm text-slate-300"
            >
              <option value="1">Tier 1 — Strategic (all episodes)</option>
              <option value="2">Tier 2 — Aligned (keyword filter)</option>
              <option value="3">Tier 3 — Monitoring (strict filter)</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-400 block mb-1">Notes</label>
            <textarea
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              className="w-full px-3 py-2 rounded-md bg-[#1a1f2e] border border-slate-600 text-sm text-slate-200 focus:outline-none focus:border-purple-500 h-20 resize-none"
              placeholder="Optional notes..."
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200">
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-sm bg-purple-600 text-white rounded-md hover:bg-purple-500"
            >
              Add Podcast
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
