'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Globe,
  Search,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Loader2,
  Mail,
  Building2,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Pencil,
  Users,
  Database,
  Zap,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { EnrichmentPipelineStats } from '@/types'

interface DomainMapping {
  id: string
  organization: string
  domain: string | null
  resolvedBy: string
  confidence: string
  notes: string | null
}

interface EnrichmentResult {
  id: string
  contactId: string
  email: string | null
  score: number | null
  domain: string | null
  status: string
  source: string
  createdAt: string
  contact: {
    id: string
    name: string
    organization: string | null
    email: string | null
    tier: number
    strategicValue: number
  }
}

type Tab = 'domains' | 'lookup' | 'review' | 'completed'

const CONFIDENCE_COLORS: Record<string, string> = {
  high: 'bg-green-100 text-green-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-red-100 text-red-700',
}

const SCORE_COLOR = (score: number) => {
  if (score >= 80) return 'text-green-600'
  if (score >= 50) return 'text-amber-600'
  return 'text-red-600'
}

const TIER_BADGE: Record<number, string> = {
  1: 'bg-amber-100 text-amber-700',
  2: 'bg-blue-100 text-blue-700',
  3: 'bg-gray-100 text-gray-500',
}

export function EnrichmentPageContent() {
  const [stats, setStats] = useState<EnrichmentPipelineStats | null>(null)
  const [domains, setDomains] = useState<DomainMapping[]>([])
  const [results, setResults] = useState<EnrichmentResult[]>([])
  const [activeTab, setActiveTab] = useState<Tab>('domains')
  const [loading, setLoading] = useState(true)
  const [resolving, setResolving] = useState(false)
  const [finding, setFinding] = useState(false)
  const [batchApproving, setBatchApproving] = useState(false)
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set())
  const [editingDomain, setEditingDomain] = useState<string | null>(null)
  const [editDomainValue, setEditDomainValue] = useState('')
  const [editingEmail, setEditingEmail] = useState<string | null>(null)
  const [editEmailValue, setEditEmailValue] = useState('')
  const [findProgress, setFindProgress] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    try {
      const [statsRes, domainsRes, resultsRes] = await Promise.all([
        fetch('/api/enrichment/status'),
        fetch('/api/enrichment/domains'),
        fetch('/api/enrichment/results'),
      ])
      if (statsRes.ok) setStats(await statsRes.json())
      if (domainsRes.ok) setDomains(await domainsRes.json())
      if (resultsRes.ok) setResults(await resultsRes.json())
    } catch (err) {
      console.error('Failed to fetch enrichment data:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // ── Actions ──

  const resolveDomains = async () => {
    setResolving(true)
    try {
      const res = await fetch('/api/enrichment/resolve-domains', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (!res.ok) {
        const err = await res.json()
        alert(`Domain resolution failed: ${err.error}`)
      }
      await fetchData()
    } catch (err) {
      alert('Domain resolution failed')
    } finally {
      setResolving(false)
    }
  }

  const findAllEmails = async () => {
    setFinding(true)
    setFindProgress('Starting batch lookup...')
    try {
      const res = await fetch('/api/enrichment/find-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batch: true }),
      })
      const data = await res.json()
      if (!res.ok) {
        alert(`Email lookup failed: ${data.error}`)
      } else {
        setFindProgress(`Found ${data.results?.filter((r: { status: string }) => r.status === 'found').length || 0} emails`)
      }
      await fetchData()
    } catch (err) {
      alert('Email lookup failed')
    } finally {
      setFinding(false)
      setTimeout(() => setFindProgress(null), 3000)
    }
  }

  const findSingleEmail = async (contactId: string) => {
    setProcessingIds(prev => { const n = new Set(Array.from(prev)); n.add(contactId); return n })
    try {
      const res = await fetch('/api/enrichment/find-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactId }),
      })
      if (!res.ok) {
        const err = await res.json()
        alert(`Lookup failed: ${err.error}`)
      }
      await fetchData()
    } finally {
      setProcessingIds(prev => { const n = new Set(Array.from(prev)); n.delete(contactId); return n })
    }
  }

  const reviewResult = async (resultId: string, action: string, editedEmail?: string) => {
    setProcessingIds(prev => { const n = new Set(Array.from(prev)); n.add(resultId); return n })
    try {
      const res = await fetch('/api/enrichment/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resultId, action, editedEmail }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (data.duplicate) {
          alert(`Duplicate: ${data.error}`)
        } else {
          alert(`Review failed: ${data.error}`)
        }
      }
      setEditingEmail(null)
      await fetchData()
    } finally {
      setProcessingIds(prev => { const n = new Set(Array.from(prev)); n.delete(resultId); return n })
    }
  }

  const batchApprove = async (minScore: number) => {
    setBatchApproving(true)
    try {
      const res = await fetch('/api/enrichment/batch-approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ minScore }),
      })
      const data = await res.json()
      if (!res.ok) {
        alert(`Batch approve failed: ${data.error}`)
      } else {
        alert(`Approved ${data.approved} emails${data.errors?.length ? `\n\nWarnings:\n${data.errors.join('\n')}` : ''}`)
      }
      await fetchData()
    } finally {
      setBatchApproving(false)
    }
  }

  const saveDomainEdit = async (id: string) => {
    try {
      const res = await fetch('/api/enrichment/domains', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, domain: editDomainValue || null }),
      })
      if (!res.ok) {
        alert('Failed to update domain')
      }
      setEditingDomain(null)
      await fetchData()
    } catch {
      alert('Failed to update domain')
    }
  }

  // ── Derived data ──

  const pendingReview = results.filter(r => r.status === 'found')
  const completed = results.filter(r => r.status === 'approved' || r.status === 'rejected')
  const govDomains = domains.filter(d => d.domain === null)
  const resolvedDomains = domains.filter(d => d.domain !== null)

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Contact Enrichment</h1>
          <p className="text-sm text-gray-500 mt-1">Find professional emails for your contacts</p>
        </div>
        <button
          onClick={fetchData}
          className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </button>
      </div>

      {/* Stats Bar */}
      {stats && (
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
          <StatCard label="Total Contacts" value={stats.totalContacts} icon={Users} />
          <StatCard label="Have Email" value={stats.haveEmail} icon={Mail} color="green" />
          <StatCard label="Missing Email" value={stats.missingEmail} icon={AlertTriangle} color="amber" />
          <StatCard label="Pending Review" value={stats.pendingReview} icon={Search} color="blue" />
          <StatCard label="Approved" value={stats.approved} icon={CheckCircle} color="green" />
        </div>
      )}

      {/* Pipeline Steps */}
      {stats && (
        <div className="flex items-center gap-2 text-xs text-gray-500 rounded-lg border p-3 bg-gray-50">
          <span className="font-medium text-gray-700">Pipeline:</span>
          <Step num={1} label={`${stats.pendingDomainResolution} orgs need domains`} active={stats.pendingDomainResolution > 0} />
          <span className="text-gray-300">→</span>
          <Step num={2} label={`${stats.pendingEmailLookup} ready for lookup`} active={stats.pendingEmailLookup > 0} />
          <span className="text-gray-300">→</span>
          <Step num={3} label={`${stats.pendingReview} pending review`} active={stats.pendingReview > 0} />
          <span className="text-gray-300">→</span>
          <Step num={4} label={`${stats.approved} approved`} active={false} />
        </div>
      )}

      {/* Tabs */}
      <div className="border-b">
        <div className="flex gap-0">
          <TabButton active={activeTab === 'domains'} onClick={() => setActiveTab('domains')}>
            <Globe className="h-3.5 w-3.5" /> Domains ({domains.length})
          </TabButton>
          <TabButton active={activeTab === 'lookup'} onClick={() => setActiveTab('lookup')}>
            <Search className="h-3.5 w-3.5" /> Email Lookup
          </TabButton>
          <TabButton active={activeTab === 'review'} onClick={() => setActiveTab('review')}>
            <Mail className="h-3.5 w-3.5" /> Review ({pendingReview.length})
          </TabButton>
          <TabButton active={activeTab === 'completed'} onClick={() => setActiveTab('completed')}>
            <CheckCircle className="h-3.5 w-3.5" /> Completed ({completed.length})
          </TabButton>
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'domains' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-600">
              {stats?.pendingDomainResolution || 0} organizations need domain resolution
            </p>
            <button
              onClick={resolveDomains}
              disabled={resolving || (stats?.pendingDomainResolution || 0) === 0}
              className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {resolving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
              {resolving ? 'Resolving...' : 'Resolve All Domains'}
            </button>
          </div>

          {resolvedDomains.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">Resolved Domains ({resolvedDomains.length})</h3>
              <div className="rounded-lg border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-left">
                    <tr>
                      <th className="px-3 py-2 font-medium text-gray-500">Organization</th>
                      <th className="px-3 py-2 font-medium text-gray-500">Domain</th>
                      <th className="px-3 py-2 font-medium text-gray-500">Confidence</th>
                      <th className="px-3 py-2 font-medium text-gray-500">Source</th>
                      <th className="px-3 py-2 font-medium text-gray-500 w-20"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {resolvedDomains.map(d => (
                      <tr key={d.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2 font-medium text-gray-900">{d.organization}</td>
                        <td className="px-3 py-2">
                          {editingDomain === d.id ? (
                            <div className="flex gap-1">
                              <input
                                type="text"
                                value={editDomainValue}
                                onChange={e => setEditDomainValue(e.target.value)}
                                className="w-48 rounded border px-2 py-0.5 text-sm"
                                autoFocus
                              />
                              <button
                                onClick={() => saveDomainEdit(d.id)}
                                className="text-green-600 hover:text-green-700"
                              >
                                <CheckCircle className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => setEditingDomain(null)}
                                className="text-gray-400 hover:text-gray-600"
                              >
                                <XCircle className="h-4 w-4" />
                              </button>
                            </div>
                          ) : (
                            <span className="text-blue-600">{d.domain}</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <span className={cn('rounded px-1.5 py-0.5 text-xs font-medium', CONFIDENCE_COLORS[d.confidence] || CONFIDENCE_COLORS.medium)}>
                            {d.confidence}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-gray-500 text-xs">{d.resolvedBy}</td>
                        <td className="px-3 py-2">
                          <button
                            onClick={() => { setEditingDomain(d.id); setEditDomainValue(d.domain || '') }}
                            className="text-gray-400 hover:text-gray-600"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {govDomains.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">No Public Domain ({govDomains.length})</h3>
              <div className="rounded-lg border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-left">
                    <tr>
                      <th className="px-3 py-2 font-medium text-gray-500">Organization</th>
                      <th className="px-3 py-2 font-medium text-gray-500">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {govDomains.map(d => (
                      <tr key={d.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2 font-medium text-gray-900">{d.organization}</td>
                        <td className="px-3 py-2 text-gray-500 text-xs">{d.notes || 'No public domain'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'lookup' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-600">
              {stats?.pendingEmailLookup || 0} contacts ready for Hunter.io lookup
            </p>
            <div className="flex items-center gap-3">
              {findProgress && (
                <span className="text-xs text-gray-500">{findProgress}</span>
              )}
              <button
                onClick={findAllEmails}
                disabled={finding || (stats?.pendingEmailLookup || 0) === 0}
                className="flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {finding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                {finding ? 'Looking up...' : 'Find All Emails'}
              </button>
            </div>
          </div>

          {/* Show recent results including not_found and errors */}
          {results.filter(r => r.status === 'not_found' || r.status === 'error').length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">Not Found / Errors</h3>
              <div className="rounded-lg border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-left">
                    <tr>
                      <th className="px-3 py-2 font-medium text-gray-500">Contact</th>
                      <th className="px-3 py-2 font-medium text-gray-500">Organization</th>
                      <th className="px-3 py-2 font-medium text-gray-500">Domain</th>
                      <th className="px-3 py-2 font-medium text-gray-500">Status</th>
                      <th className="px-3 py-2 font-medium text-gray-500 w-24"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {results
                      .filter(r => r.status === 'not_found' || r.status === 'error')
                      .map(r => (
                        <tr key={r.id} className="hover:bg-gray-50">
                          <td className="px-3 py-2">
                            <span className="font-medium text-gray-900">{r.contact.name}</span>
                            <span className={cn('ml-1.5 rounded px-1 py-0.5 text-xs font-medium', TIER_BADGE[r.contact.tier] || TIER_BADGE[3])}>
                              T{r.contact.tier}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-gray-500">{r.contact.organization}</td>
                          <td className="px-3 py-2 text-blue-600 text-xs">{r.domain}</td>
                          <td className="px-3 py-2">
                            <span className={cn(
                              'rounded px-1.5 py-0.5 text-xs font-medium',
                              r.status === 'error' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-500'
                            )}>
                              {r.status === 'error' ? 'Error' : 'Not found'}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            <button
                              onClick={() => findSingleEmail(r.contact.id)}
                              disabled={processingIds.has(r.contact.id)}
                              className="text-xs text-blue-600 hover:text-blue-700 disabled:opacity-50"
                            >
                              Retry
                            </button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'review' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-600">
              {pendingReview.length} emails found, pending your review
            </p>
            {pendingReview.filter(r => (r.score || 0) >= 80).length > 0 && (
              <button
                onClick={() => batchApprove(80)}
                disabled={batchApproving}
                className="flex items-center gap-1.5 rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
              >
                {batchApproving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle className="h-3.5 w-3.5" />}
                Approve All 80+ ({pendingReview.filter(r => (r.score || 0) >= 80).length})
              </button>
            )}
          </div>

          {pendingReview.length === 0 ? (
            <div className="text-center py-10 text-gray-400 text-sm">
              No emails pending review. Run email lookup first.
            </div>
          ) : (
            <div className="rounded-lg border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-left">
                  <tr>
                    <th className="px-3 py-2 font-medium text-gray-500">Contact</th>
                    <th className="px-3 py-2 font-medium text-gray-500">Organization</th>
                    <th className="px-3 py-2 font-medium text-gray-500">Found Email</th>
                    <th className="px-3 py-2 font-medium text-gray-500">Score</th>
                    <th className="px-3 py-2 font-medium text-gray-500 w-48">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {pendingReview
                    .sort((a, b) => (b.score || 0) - (a.score || 0))
                    .map(r => (
                      <tr key={r.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2">
                          <span className="font-medium text-gray-900">{r.contact.name}</span>
                          <span className={cn('ml-1.5 rounded px-1 py-0.5 text-xs font-medium', TIER_BADGE[r.contact.tier] || TIER_BADGE[3])}>
                            T{r.contact.tier}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-gray-500">{r.contact.organization}</td>
                        <td className="px-3 py-2">
                          {editingEmail === r.id ? (
                            <input
                              type="email"
                              value={editEmailValue}
                              onChange={e => setEditEmailValue(e.target.value)}
                              className="w-56 rounded border px-2 py-0.5 text-sm"
                              autoFocus
                            />
                          ) : (
                            <span className="text-blue-600 font-mono text-xs">{r.email}</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {r.score !== null && (
                            <span className={cn('font-semibold', SCORE_COLOR(r.score))}>
                              {r.score}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {processingIds.has(r.id) ? (
                            <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                          ) : editingEmail === r.id ? (
                            <div className="flex gap-1">
                              <button
                                onClick={() => reviewResult(r.id, 'edit_approve', editEmailValue)}
                                className="rounded bg-green-600 px-2 py-0.5 text-xs text-white hover:bg-green-700"
                              >
                                Save & Approve
                              </button>
                              <button
                                onClick={() => setEditingEmail(null)}
                                className="rounded border px-2 py-0.5 text-xs text-gray-600 hover:bg-gray-50"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <div className="flex gap-1">
                              <button
                                onClick={() => reviewResult(r.id, 'approve')}
                                className="rounded bg-green-600 px-2 py-0.5 text-xs text-white hover:bg-green-700"
                              >
                                Approve
                              </button>
                              <button
                                onClick={() => { setEditingEmail(r.id); setEditEmailValue(r.email || '') }}
                                className="rounded border px-2 py-0.5 text-xs text-gray-600 hover:bg-gray-50"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => reviewResult(r.id, 'reject')}
                                className="rounded border border-red-200 px-2 py-0.5 text-xs text-red-600 hover:bg-red-50"
                              >
                                Reject
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'completed' && (
        <div className="space-y-4">
          {completed.length === 0 ? (
            <div className="text-center py-10 text-gray-400 text-sm">
              No completed enrichments yet.
            </div>
          ) : (
            <div className="rounded-lg border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-left">
                  <tr>
                    <th className="px-3 py-2 font-medium text-gray-500">Contact</th>
                    <th className="px-3 py-2 font-medium text-gray-500">Email</th>
                    <th className="px-3 py-2 font-medium text-gray-500">Score</th>
                    <th className="px-3 py-2 font-medium text-gray-500">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {completed.map(r => (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2">
                        <span className="font-medium text-gray-900">{r.contact.name}</span>
                        <span className={cn('ml-1.5 rounded px-1 py-0.5 text-xs font-medium', TIER_BADGE[r.contact.tier] || TIER_BADGE[3])}>
                          T{r.contact.tier}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-blue-600 font-mono text-xs">{r.email || '—'}</td>
                      <td className="px-3 py-2">
                        {r.score !== null && (
                          <span className={cn('font-semibold', SCORE_COLOR(r.score))}>
                            {r.score}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <span className={cn(
                          'rounded px-1.5 py-0.5 text-xs font-medium',
                          r.status === 'approved' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                        )}>
                          {r.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Sub-components ──

function StatCard({ label, value, icon: Icon, color }: {
  label: string
  value: number
  icon: React.ComponentType<{ className?: string }>
  color?: 'green' | 'amber' | 'blue'
}) {
  const colors = {
    green: 'text-green-600 bg-green-50',
    amber: 'text-amber-600 bg-amber-50',
    blue: 'text-blue-600 bg-blue-50',
  }
  const c = color ? colors[color] : 'text-gray-600 bg-gray-50'

  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-center gap-2 mb-1">
        <div className={cn('rounded p-1', c)}>
          <Icon className="h-3.5 w-3.5" />
        </div>
        <span className="text-xs text-gray-500">{label}</span>
      </div>
      <p className="text-xl font-bold text-gray-900">{value}</p>
    </div>
  )
}

function Step({ num, label, active }: { num: number; label: string; active: boolean }) {
  return (
    <span className={cn(
      'flex items-center gap-1 rounded-full px-2 py-0.5',
      active ? 'bg-blue-100 text-blue-700 font-medium' : 'text-gray-400'
    )}>
      <span className={cn(
        'flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold',
        active ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-400'
      )}>
        {num}
      </span>
      {label}
    </span>
  )
}

function TabButton({ active, onClick, children }: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
        active
          ? 'border-blue-600 text-blue-600'
          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
      )}
    >
      {children}
    </button>
  )
}
