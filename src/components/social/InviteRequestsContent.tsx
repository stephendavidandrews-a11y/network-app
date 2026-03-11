'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type InviteRequest = {
  id: string
  name: string
  phone: string
  howKnowMe: string | null
  eventId: string | null
  status: string
  createdAt: string
  reviewedAt: string | null
  event: { id: string; title: string | null; date: string } | null
}

export function InviteRequestsContent({ inviteRequests }: { inviteRequests: InviteRequest[] }) {
  const router = useRouter()
  const [filter, setFilter] = useState<'pending' | 'approved' | 'declined' | 'all'>('pending')
  const [loading, setLoading] = useState<string | null>(null)

  const filtered = filter === 'all'
    ? inviteRequests
    : inviteRequests.filter(r => r.status === filter)

  const pendingCount = inviteRequests.filter(r => r.status === 'pending').length

  const handleAction = async (id: string, status: 'approved' | 'declined') => {
    setLoading(id)
    try {
      const res = await fetch(`/api/social/invite-requests/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (res.ok) {
        router.refresh()
      } else {
        const data = await res.json()
        alert(data.error || 'Failed to update')
      }
    } catch (err) {
      alert('Network error')
    } finally {
      setLoading(null)
    }
  }

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
      })
    } catch {
      return dateStr
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Invite Requests</h1>
          <p className="text-sm text-slate-400 mt-1">
            Review requests from your events page
          </p>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2">
        {(['pending', 'approved', 'declined', 'all'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === tab
                ? 'bg-blue-600 text-white'
                : 'bg-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
            {tab === 'pending' && pendingCount > 0 && (
              <span className="ml-2 px-1.5 py-0.5 bg-red-500 text-white text-xs rounded-full">
                {pendingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Cards */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-slate-500">
          No {filter === 'all' ? '' : filter} invite requests
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(req => (
            <div key={req.id} className="rounded-lg bg-slate-800/50 border border-slate-700/50 p-5">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <h3 className="text-lg font-semibold text-slate-100">{req.name}</h3>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      req.status === 'pending' ? 'bg-yellow-500/20 text-yellow-400' :
                      req.status === 'approved' ? 'bg-green-500/20 text-green-400' :
                      'bg-red-500/20 text-red-400'
                    }`}>
                      {req.status}
                    </span>
                  </div>
                  <div className="mt-2 space-y-1 text-sm text-slate-400">
                    <div>Phone: <span className="text-slate-300">{req.phone}</span></div>
                    {req.howKnowMe && (
                      <div>How they know you: <span className="text-slate-300">{req.howKnowMe}</span></div>
                    )}
                    <div>
                      {req.event ? (
                        <>Event: <span className="text-slate-300">{req.event.title || 'Untitled'} ({formatDate(req.event.date)})</span></>
                      ) : (
                        <span className="text-slate-500 italic">General signup (no specific event)</span>
                      )}
                    </div>
                    <div className="text-slate-500 text-xs mt-1">
                      Submitted {formatDate(req.createdAt)}
                      {req.reviewedAt && <> &middot; Reviewed {formatDate(req.reviewedAt)}</>}
                    </div>
                  </div>
                </div>

                {req.status === 'pending' && (
                  <div className="flex gap-2 ml-4">
                    <button
                      onClick={() => handleAction(req.id, 'approved')}
                      disabled={loading === req.id}
                      className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                    >
                      {loading === req.id ? '...' : 'Approve'}
                    </button>
                    <button
                      onClick={() => handleAction(req.id, 'declined')}
                      disabled={loading === req.id}
                      className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                    >
                      Decline
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
