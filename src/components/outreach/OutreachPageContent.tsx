'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Send, Clock, CheckCircle, Edit, X, SkipForward } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TIER_COLORS } from '@/lib/constants'
import { formatDate } from '@/lib/utils'

interface OutreachItem {
  id: string
  contactId: string
  contactName: string
  contactOrg: string | null
  contactTier: number
  triggerType: string
  triggerDescription: string
  draftSubject: string | null
  draftBody: string | null
  priority: number
  status: string
  createdAt: string
}

interface HistoryItem {
  id: string
  contactId: string
  contactName: string
  contactOrg: string | null
  draftSubject: string | null
  finalText: string | null
  wasEdited: boolean
  sentAt: string | null
}

interface Props {
  queue: OutreachItem[]
  history: HistoryItem[]
}

export function OutreachPageContent({ queue, history }: Props) {
  const [activeTab, setActiveTab] = useState<'queue' | 'history'>('queue')
  const [editingId, setEditingId] = useState<string | null>(null)

  const handleAction = async (id: string, action: 'approve' | 'skip' | 'defer') => {
    const statusMap = { approve: 'approved', skip: 'skipped', defer: 'deferred' }
    await fetch(`/api/outreach/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: statusMap[action] }),
    })
    window.location.reload()
  }

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Outreach</h1>
        <div className="flex rounded-md border">
          <button onClick={() => setActiveTab('queue')}
            className={cn('px-4 py-1.5 text-sm font-medium rounded-l-md', activeTab === 'queue' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50')}>
            Queue ({queue.length})
          </button>
          <button onClick={() => setActiveTab('history')}
            className={cn('px-4 py-1.5 text-sm font-medium rounded-r-md', activeTab === 'history' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50')}>
            History
          </button>
        </div>
      </div>

      {activeTab === 'queue' ? (
        queue.length === 0 ? (
          <div className="rounded-lg border bg-white p-8 text-center text-gray-500">
            <Send className="h-8 w-8 mx-auto mb-2 text-gray-300" />
            <p>Outreach queue is empty</p>
          </div>
        ) : (
          <div className="space-y-3">
            {queue.map(item => (
              <div key={item.id} className="rounded-lg border bg-white p-5">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-blue-50 px-1.5 py-0.5 text-xs font-medium text-blue-600">P{item.priority}</span>
                      <span className={cn('inline-flex h-5 items-center rounded border px-1.5 text-xs font-medium', TIER_COLORS[item.contactTier])}>
                        T{item.contactTier}
                      </span>
                      <Link href={`/contacts/${item.contactId}`} className="font-medium text-gray-900 hover:text-blue-600">
                        {item.contactName}
                      </Link>
                      {item.contactOrg && <span className="text-sm text-gray-400">{item.contactOrg}</span>}
                    </div>
                    <p className="text-sm text-gray-600 mt-1">{item.triggerDescription}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {item.triggerType.replace(/_/g, ' ')} &middot; {formatDate(item.createdAt)}
                    </p>

                    {item.draftSubject && (
                      <div className="mt-3 rounded bg-gray-50 p-3">
                        <p className="text-sm font-medium text-gray-700">Subject: {item.draftSubject}</p>
                        {item.draftBody && (
                          <p className="text-sm text-gray-600 mt-1 whitespace-pre-wrap line-clamp-4">{item.draftBody}</p>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col gap-1.5 ml-4">
                    <button onClick={() => handleAction(item.id, 'approve')}
                      className="flex items-center gap-1 rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700">
                      <CheckCircle className="h-3 w-3" /> Approve
                    </button>
                    <Link href={`/outreach/${item.id}/edit`}
                      className="flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
                      <Edit className="h-3 w-3" /> Edit
                    </Link>
                    <button onClick={() => handleAction(item.id, 'defer')}
                      className="flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
                      <Clock className="h-3 w-3" /> Defer
                    </button>
                    <button onClick={() => handleAction(item.id, 'skip')}
                      className="flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs font-medium text-gray-400 hover:bg-gray-50">
                      <SkipForward className="h-3 w-3" /> Skip
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        history.length === 0 ? (
          <div className="rounded-lg border bg-white p-8 text-center text-gray-500">No outreach sent yet</div>
        ) : (
          <div className="rounded-lg border bg-white divide-y">
            {history.map(item => (
              <div key={item.id} className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Link href={`/contacts/${item.contactId}`} className="text-sm font-medium text-gray-900 hover:text-blue-600">
                      {item.contactName}
                    </Link>
                    {item.contactOrg && <span className="text-xs text-gray-400 ml-2">{item.contactOrg}</span>}
                    {item.draftSubject && <p className="text-sm text-gray-600 mt-0.5">{item.draftSubject}</p>}
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-gray-400">{formatDate(item.sentAt)}</span>
                    {item.wasEdited && <span className="block text-xs text-amber-500">Edited</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  )
}
