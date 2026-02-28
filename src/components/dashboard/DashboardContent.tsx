'use client'

import Link from 'next/link'
import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  CheckCircle,
  Clock,
  Mail,
  Radio,
  Send,
  TrendingUp,
  Users,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { TIER_COLORS, STATUS_COLORS } from '@/lib/constants'
import { formatRelativeDate, formatDate } from '@/lib/utils'

interface DashboardProps {
  data: {
    totalContacts: number
    overdueCount: number
    overdueTier1: number
    overdueTier2: number
    overdueTier3: number
    openCommitmentsCount: number
    outreachReadyCount: number
    contacted7d: number
    contacted30d: number
    outreachSentThisWeek: number
    recentSignals: Array<{
      id: string
      signalType: string
      title: string
      detectedAt: string
      contactName: string
      contactOrg: string | null
      contactId: string
      sourceName: string | null
    }>
    pendingOutreach: Array<{
      id: string
      contactName: string
      contactOrg: string | null
      contactTier: number
      triggerDescription: string
      draftSubject: string | null
      draftBody: string | null
      priority: number
      status: string
    }>
    openCommitments: Array<{
      description: string
      dueDate: string | null
      contactName: string
      contactId: string
      interactionDate: string
      daysOverdue: number | null
    }>
    upcomingEvents: Array<{
      id: string
      name: string
      dateStart: string | null
      location: string | null
      attending: boolean
      speaking: boolean
      cfpDeadline: string | null
      cfpStatus: string
    }>
    overdueContacts: Array<{
      id: string
      name: string
      organization: string | null
      tier: number
      lastInteractionDate: string | null
      daysSince: number | null
      targetCadenceDays: number
    }>
  }
}

export function DashboardContent({ data }: DashboardProps) {
  const today = new Date()
  const greeting = today.getHours() < 12 ? 'Good morning' : today.getHours() < 17 ? 'Good afternoon' : 'Good evening'
  const dateStr = today.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{greeting}, Stephen</h1>
          <p className="text-sm text-gray-500 mt-0.5">{dateStr}</p>
        </div>
        <div className="flex gap-4 text-sm">
          <span className="text-red-600 font-medium">{data.overdueCount} overdue contacts</span>
          <span className="text-amber-600 font-medium">{data.openCommitmentsCount} open commitments</span>
          <span className="text-blue-600 font-medium">{data.outreachReadyCount} outreach drafts ready</span>
        </div>
      </div>

      {/* Outreach Queue */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Send className="h-5 w-5 text-blue-600" />
            Outreach Queue
            {data.outreachReadyCount > 0 && (
              <span className="ml-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                {data.outreachReadyCount}
              </span>
            )}
          </h2>
          <Link href="/outreach" className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1">
            View all <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        {data.pendingOutreach.length === 0 ? (
          <div className="rounded-lg border bg-white p-4 text-sm text-gray-500">No outreach items in queue</div>
        ) : (
          <div className="grid gap-3">
            {data.pendingOutreach.slice(0, 5).map((item) => (
              <div key={item.id} className="rounded-lg border bg-white p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className={cn('inline-flex h-5 items-center rounded border px-1.5 text-xs font-medium', TIER_COLORS[item.contactTier])}>
                        T{item.contactTier}
                      </span>
                      <Link href={`/contacts/${item.id}`} className="font-medium text-gray-900 hover:text-blue-600">
                        {item.contactName}
                      </Link>
                      {item.contactOrg && <span className="text-sm text-gray-500">{item.contactOrg}</span>}
                    </div>
                    <p className="mt-1 text-sm text-gray-600">{item.triggerDescription}</p>
                    {item.draftSubject && (
                      <p className="mt-1.5 text-sm text-gray-400 italic truncate">
                        &quot;{item.draftSubject}&quot;
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2 ml-4">
                    <Link href={`/outreach?edit=${item.id}`} className="rounded-md border px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
                      Edit
                    </Link>
                    <button className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700">
                      Approve & Send
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Network Health Metrics */}
      <section>
        <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2 mb-3">
          <TrendingUp className="h-5 w-5 text-green-600" />
          Network Health
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MetricCard label="Contacted (7d)" value={data.contacted7d} subtext={`of ${data.totalContacts}`} />
          <MetricCard label="Contacted (30d)" value={data.contacted30d} subtext={`of ${data.totalContacts}`} />
          <MetricCard
            label="Overdue by Tier"
            value={`${data.overdueTier1} / ${data.overdueTier2} / ${data.overdueTier3}`}
            subtext="T1 / T2 / T3"
            alert={data.overdueTier1 > 0}
          />
          <MetricCard label="Outreach Sent (7d)" value={data.outreachSentThisWeek} />
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Signals */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Radio className="h-5 w-5 text-violet-600" />
              Recent Signals
            </h2>
            <Link href="/signals" className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1">
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          {data.recentSignals.length === 0 ? (
            <div className="rounded-lg border bg-white p-4 text-sm text-gray-500">No recent signals</div>
          ) : (
            <div className="rounded-lg border bg-white divide-y">
              {data.recentSignals.slice(0, 5).map((signal) => (
                <div key={signal.id} className="p-3 hover:bg-gray-50">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Link href={`/contacts/${signal.contactId}`} className="text-sm font-medium text-gray-900 hover:text-blue-600 truncate">
                          {signal.contactName}
                        </Link>
                        <span className="rounded bg-violet-50 px-1.5 py-0.5 text-xs text-violet-600">
                          {signal.signalType.replace(/_/g, ' ')}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 mt-0.5 truncate">{signal.title}</p>
                    </div>
                    <span className="text-xs text-gray-400 ml-2 whitespace-nowrap">
                      {formatRelativeDate(signal.detectedAt)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Commitment Alerts */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Commitment Alerts
            </h2>
            <Link href="/commitments" className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1">
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          {data.openCommitments.length === 0 ? (
            <div className="rounded-lg border bg-white p-4 text-sm text-gray-500">No open commitments</div>
          ) : (
            <div className="rounded-lg border bg-white divide-y">
              {data.openCommitments.slice(0, 5).map((commitment, i) => (
                <div key={i} className="p-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-900">{commitment.description}</p>
                      <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                        <Link href={`/contacts/${commitment.contactId}`} className="hover:text-blue-600">
                          {commitment.contactName}
                        </Link>
                        {commitment.dueDate && <span>Due {formatDate(commitment.dueDate)}</span>}
                      </div>
                    </div>
                    {commitment.daysOverdue && (
                      <span className="rounded bg-red-50 px-1.5 py-0.5 text-xs font-medium text-red-600">
                        {commitment.daysOverdue}d overdue
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Overdue Contacts */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Clock className="h-5 w-5 text-red-500" />
              Overdue Contacts
            </h2>
            <Link href="/contacts?overdue=true" className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1">
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          {data.overdueContacts.length === 0 ? (
            <div className="rounded-lg border bg-white p-4 text-sm text-gray-500">All contacts are up to date</div>
          ) : (
            <div className="rounded-lg border bg-white divide-y">
              {data.overdueContacts.map((contact) => (
                <Link key={contact.id} href={`/contacts/${contact.id}`} className="flex items-center justify-between p-3 hover:bg-gray-50">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={cn('inline-flex h-5 items-center rounded border px-1.5 text-xs font-medium', TIER_COLORS[contact.tier])}>
                      T{contact.tier}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{contact.name}</p>
                      {contact.organization && <p className="text-xs text-gray-500 truncate">{contact.organization}</p>}
                    </div>
                  </div>
                  <span className="text-xs text-red-500 font-medium whitespace-nowrap ml-2">
                    {contact.daysSince !== null ? `${contact.daysSince}d` : 'Never'} / {contact.targetCadenceDays}d
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* Upcoming Events */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Calendar className="h-5 w-5 text-blue-500" />
              Upcoming Events
            </h2>
            <Link href="/events" className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1">
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          {data.upcomingEvents.length === 0 ? (
            <div className="rounded-lg border bg-white p-4 text-sm text-gray-500">No upcoming events</div>
          ) : (
            <div className="rounded-lg border bg-white divide-y">
              {data.upcomingEvents.slice(0, 5).map((event) => (
                <Link key={event.id} href={`/events/${event.id}`} className="flex items-center justify-between p-3 hover:bg-gray-50">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-gray-900 truncate">{event.name}</p>
                      {event.attending && (
                        <span className="rounded bg-green-50 px-1.5 py-0.5 text-xs text-green-600">Attending</span>
                      )}
                      {event.speaking && (
                        <span className="rounded bg-blue-50 px-1.5 py-0.5 text-xs text-blue-600">Speaking</span>
                      )}
                    </div>
                    {event.location && <p className="text-xs text-gray-500 mt-0.5">{event.location}</p>}
                  </div>
                  <div className="text-right ml-2">
                    <p className="text-xs text-gray-500">{formatDate(event.dateStart)}</p>
                    {event.cfpDeadline && event.cfpStatus !== 'not_applicable' && event.cfpStatus !== 'submitted' && (
                      <p className="text-xs text-amber-600 font-medium">CFP: {formatDate(event.cfpDeadline)}</p>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function MetricCard({
  label,
  value,
  subtext,
  alert,
}: {
  label: string
  value: string | number
  subtext?: string
  alert?: boolean
}) {
  return (
    <div className={cn('rounded-lg border bg-white p-4', alert && 'border-red-200')}>
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">{label}</p>
      <p className={cn('text-2xl font-bold mt-1', alert ? 'text-red-600' : 'text-gray-900')}>{value}</p>
      {subtext && <p className="text-xs text-gray-400 mt-0.5">{subtext}</p>}
    </div>
  )
}
