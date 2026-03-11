'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { ArrowLeft, Globe, Rss, Code, RefreshCw, ToggleLeft, ToggleRight, AlertCircle, CheckCircle2, Plus, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface EventSource {
  id: string
  name: string
  url: string
  sourceType: string
  category: string
  scrapeFrequency: string
  enabled: boolean
  lastScrapedAt: string | null
  lastResultCount: number
  lastError: string | null
  notes: string | null
}

export function EventSourcesContent() {
  const [sources, setSources] = useState<EventSource[]>([])
  const [loading, setLoading] = useState(true)
  const [scraping, setScraping] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [newSource, setNewSource] = useState({
    name: '', url: '', sourceType: 'rss', category: 'industry_conference',
    scrapeFrequency: 'weekly', notes: '',
  })

  useEffect(() => { loadSources() }, [])

  async function loadSources() {
    try {
      const res = await fetch('/api/visibility/sources')
      const data = await res.json()
      setSources(data)
    } catch (error) {
      console.error('Failed to load sources:', error)
    } finally {
      setLoading(false)
    }
  }

  async function handleToggle(id: string, enabled: boolean) {
    await fetch(`/api/visibility/sources/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !enabled }),
    })
    loadSources()
  }

  async function handleScrape(id: string) {
    setScraping(id)
    try {
      const res = await fetch(`/api/visibility/sources/${id}`, { method: 'POST' })
      const data = await res.json()
      alert(`Discovered ${data.discovered} events (${data.skipped} skipped)${data.error ? `\nError: ${data.error}` : ''}`)
      loadSources()
    } catch (error) {
      console.error('Scrape failed:', error)
    } finally {
      setScraping(null)
    }
  }

  async function handleAdd() {
    const res = await fetch('/api/visibility/sources', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newSource),
    })
    if (res.ok) {
      setShowAdd(false)
      setNewSource({ name: '', url: '', sourceType: 'rss', category: 'industry_conference', scrapeFrequency: 'weekly', notes: '' })
      loadSources()
    }
  }

  const typeIcon = (t: string) => {
    if (t === 'rss') return <Rss className="h-3.5 w-3.5 text-orange-500" />
    if (t === 'api') return <Code className="h-3.5 w-3.5 text-green-500" />
    return <Globe className="h-3.5 w-3.5 text-blue-500" />
  }

  const timeSince = (date: string | null) => {
    if (!date) return 'Never'
    const hours = Math.floor((Date.now() - new Date(date).getTime()) / 3600000)
    if (hours < 1) return 'Just now'
    if (hours < 24) return `${hours}h ago`
    return `${Math.floor(hours / 24)}d ago`
  }

  if (loading) return <div className="p-8 text-center text-gray-400">Loading sources...</div>

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/events" className="text-gray-400 hover:text-gray-600"><ArrowLeft className="h-5 w-5" /></Link>
          <h1 className="text-2xl font-bold text-gray-900">Event Sources</h1>
          <span className="text-sm text-gray-400">{sources.length} sources</span>
        </div>
        <button onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700">
          {showAdd ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {showAdd ? 'Cancel' : 'Add Source'}
        </button>
      </div>

      {showAdd && (
        <div className="rounded-lg border bg-white p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <input placeholder="Source name" value={newSource.name} onChange={e => setNewSource(p => ({ ...p, name: e.target.value }))}
              className="px-3 py-2 text-sm border rounded-md" />
            <input placeholder="URL" value={newSource.url} onChange={e => setNewSource(p => ({ ...p, url: e.target.value }))}
              className="px-3 py-2 text-sm border rounded-md" />
            <select value={newSource.sourceType} onChange={e => setNewSource(p => ({ ...p, sourceType: e.target.value }))}
              className="px-3 py-2 text-sm border rounded-md">
              <option value="rss">RSS</option>
              <option value="scrape">HTML Scrape</option>
              <option value="api">API</option>
              <option value="manual">Manual</option>
              <option value="tribe_api">Tribe API</option>
            </select>
            <select value={newSource.category} onChange={e => setNewSource(p => ({ ...p, category: e.target.value }))}
              className="px-3 py-2 text-sm border rounded-md">
              <option value="industry_conference">Industry Conference</option>
              <option value="legal">Legal</option>
              <option value="academic">Academic</option>
              <option value="government">Government</option>
              <option value="think_tank">Think Tank</option>
              <option value="law_firm">Law Firm</option>
              <option value="dc_local">DC Local</option>
              <option value="news">News</option>
            </select>
            <select value={newSource.scrapeFrequency} onChange={e => setNewSource(p => ({ ...p, scrapeFrequency: e.target.value }))}
              className="px-3 py-2 text-sm border rounded-md">
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="biweekly">Biweekly</option>
              <option value="monthly">Monthly</option>
            </select>
            <input placeholder="Notes (optional)" value={newSource.notes} onChange={e => setNewSource(p => ({ ...p, notes: e.target.value }))}
              className="px-3 py-2 text-sm border rounded-md" />
          </div>
          <button onClick={handleAdd} disabled={!newSource.name || !newSource.url}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50">
            Save Source
          </button>
        </div>
      )}

      <div className="space-y-2">
        {sources.map(source => (
          <div key={source.id} className={cn('rounded-lg border bg-white p-3', !source.enabled && 'opacity-50')}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                {typeIcon(source.sourceType)}
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-gray-900">{source.name}</span>
                    <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">{source.category.replace(/_/g, ' ')}</span>
                    <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">{source.scrapeFrequency}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-400">
                    <a href={source.url} target="_blank" rel="noopener noreferrer" className="hover:text-blue-500 truncate max-w-[300px]">{source.url}</a>
                    <span>Last: {timeSince(source.lastScrapedAt)}</span>
                    {source.lastResultCount > 0 && <span>{source.lastResultCount} found</span>}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {source.lastError && (
                  <span title={source.lastError} className="text-red-400"><AlertCircle className="h-4 w-4" /></span>
                )}
                {source.lastScrapedAt && !source.lastError && (
                  <span className="text-green-400"><CheckCircle2 className="h-4 w-4" /></span>
                )}
                <button onClick={() => handleScrape(source.id)} disabled={scraping === source.id || !source.enabled}
                  className="flex items-center gap-1 rounded border px-2 py-1 text-xs text-gray-500 hover:bg-gray-50 disabled:opacity-50">
                  <RefreshCw className={cn('h-3 w-3', scraping === source.id && 'animate-spin')} />
                  {scraping === source.id ? 'Scraping...' : 'Scrape Now'}
                </button>
                <button onClick={() => handleToggle(source.id, source.enabled)} className="text-gray-400 hover:text-gray-600">
                  {source.enabled ? <ToggleRight className="h-5 w-5 text-green-500" /> : <ToggleLeft className="h-5 w-5" />}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
