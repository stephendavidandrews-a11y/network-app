'use client'

import Link from 'next/link'
import { MessageSquare, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TIER_COLORS } from '@/lib/constants'
import { formatDate } from '@/lib/utils'

interface InteractionRow {
  id: string
  contactId: string
  contactName: string
  contactOrg: string | null
  type: string
  date: string
  summary: string | null
  commitments: Array<{ description: string; fulfilled: boolean }>
  followUpRequired: boolean
  followUpCompleted: boolean
  followUpDescription: string | null
}

export function InteractionsPageContent({ interactions }: { interactions: InteractionRow[] }) {
  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Interactions</h1>
        <Link href="/interactions/new"
          className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700">
          <Plus className="h-4 w-4" />
          Log Interaction
        </Link>
      </div>

      {interactions.length === 0 ? (
        <div className="rounded-lg border bg-white p-8 text-center text-gray-500">
          <MessageSquare className="h-8 w-8 mx-auto mb-2 text-gray-300" />
          <p>No interactions logged yet</p>
        </div>
      ) : (
        <div className="rounded-lg border bg-white divide-y">
          {interactions.map(interaction => (
            <div key={interaction.id} className="p-4 hover:bg-gray-50">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Link href={`/contacts/${interaction.contactId}`} className="text-sm font-medium text-gray-900 hover:text-blue-600">
                      {interaction.contactName}
                    </Link>
                    {interaction.contactOrg && (
                      <span className="text-xs text-gray-400">{interaction.contactOrg}</span>
                    )}
                    <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-600">
                      {interaction.type.replace(/_/g, ' ')}
                    </span>
                  </div>
                  {interaction.summary && (
                    <p className="text-sm text-gray-600 mt-1">{interaction.summary}</p>
                  )}
                  {interaction.commitments.length > 0 && (
                    <div className="mt-1 space-y-0.5">
                      {interaction.commitments.map((c, i) => (
                        <p key={i} className={cn('text-xs', c.fulfilled ? 'text-green-600' : 'text-amber-600')}>
                          {c.fulfilled ? '✓' : '○'} {c.description}
                        </p>
                      ))}
                    </div>
                  )}
                  {interaction.followUpRequired && !interaction.followUpCompleted && (
                    <p className="text-xs text-amber-600 mt-1">Follow-up: {interaction.followUpDescription}</p>
                  )}
                </div>
                <span className="text-xs text-gray-400 ml-4">{formatDate(interaction.date)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
