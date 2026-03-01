'use client'

import Link from 'next/link'
import { CheckCircle, CheckSquare, AlertTriangle, Clock, CalendarClock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDate } from '@/lib/utils'
import { CommitmentActions } from './CommitmentActions'
import type { CommitmentRecord, CommitmentUrgency } from '@/types'

interface CommitmentsPageContentProps {
  commitments: CommitmentRecord[]
}

const URGENCY_CONFIG: Record<CommitmentUrgency, { label: string; color: string; icon: typeof AlertTriangle }> = {
  overdue: { label: 'Overdue', color: 'text-red-600 bg-red-50 border-red-200', icon: AlertTriangle },
  today: { label: 'Due Today', color: 'text-amber-600 bg-amber-50 border-amber-200', icon: Clock },
  this_week: { label: 'Due This Week', color: 'text-blue-600 bg-blue-50 border-blue-200', icon: CalendarClock },
  upcoming: { label: 'Upcoming', color: 'text-gray-600 bg-gray-50 border-gray-200', icon: CheckSquare },
}

export function CommitmentsPageContent({ commitments }: CommitmentsPageContentProps) {
  const open = commitments.filter(c => !c.fulfilled)
  const fulfilled = commitments.filter(c => c.fulfilled)

  // Group open commitments by urgency
  const grouped: Record<CommitmentUrgency, CommitmentRecord[]> = {
    overdue: [],
    today: [],
    this_week: [],
    upcoming: [],
  }

  for (const c of open) {
    grouped[c.urgency || 'upcoming'].push(c)
  }

  // Sort each group: overdue sorted by most overdue first, others by soonest first
  grouped.overdue.sort((a, b) => (b.daysOverdue || 0) - (a.daysOverdue || 0))
  grouped.today.sort((a, b) => (a.description || '').localeCompare(b.description || ''))
  grouped.this_week.sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''))
  grouped.upcoming.sort((a, b) => (a.dueDate || 'z').localeCompare(b.dueDate || 'z'))

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Commitments</h1>

      <p className="text-sm text-gray-500">
        {open.length} open commitment{open.length !== 1 ? 's' : ''}
        {fulfilled.length > 0 && ` · ${fulfilled.length} fulfilled`}
      </p>

      {/* Open commitments by urgency group */}
      {(['overdue', 'today', 'this_week', 'upcoming'] as CommitmentUrgency[]).map(urgency => {
        const items = grouped[urgency]
        if (items.length === 0) return null

        const config = URGENCY_CONFIG[urgency]
        const Icon = config.icon

        return (
          <section key={urgency}>
            <h2 className={cn(
              'text-sm font-semibold mb-2 flex items-center gap-2 rounded-md border px-3 py-2',
              config.color
            )}>
              <Icon className="h-4 w-4" />
              {config.label} ({items.length})
            </h2>
            <div className="rounded-lg border bg-white divide-y">
              {items.map(c => (
                <div key={c.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-900">{c.description}</p>
                      <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                        <Link href={`/contacts/${c.contactId}`} className="hover:text-blue-600 font-medium">
                          {c.contactName}
                        </Link>
                        {c.interactionDate && <span>from {formatDate(c.interactionDate)}</span>}
                        {c.dueDate && <span>Due {formatDate(c.dueDate)}</span>}
                      </div>
                    </div>
                    {c.daysOverdue && c.daysOverdue > 0 && (
                      <span className="rounded bg-red-50 px-2 py-0.5 text-xs font-medium text-red-600 whitespace-nowrap">
                        {c.daysOverdue}d overdue
                      </span>
                    )}
                  </div>
                  <div className="mt-2">
                    <CommitmentActions
                      commitmentId={c.id}
                      contactName={c.contactName || 'Unknown'}
                      description={c.description}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>
        )
      })}

      {open.length === 0 && (
        <div className="rounded-lg border bg-white p-6 text-center text-sm text-gray-500">
          No open commitments
        </div>
      )}

      {/* Fulfilled */}
      {fulfilled.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-500" />
            Fulfilled ({fulfilled.length})
          </h2>
          <div className="rounded-lg border bg-white divide-y">
            {fulfilled.slice(0, 20).map(c => (
              <div key={c.id} className="p-4 text-gray-400">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm line-through">{c.description}</p>
                    <div className="flex items-center gap-2 mt-1 text-xs">
                      <Link href={`/contacts/${c.contactId}`} className="hover:text-blue-600">
                        {c.contactName}
                      </Link>
                      {c.fulfilledDate && <span>Completed {formatDate(c.fulfilledDate)}</span>}
                    </div>
                    {c.fulfilledNotes && (
                      <p className="text-xs text-gray-400 mt-1 italic">{c.fulfilledNotes}</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
