'use client'

import Link from 'next/link'
import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  CheckCircle,
  Clock,
  Heart,
  Inbox,
  Mail,
  Radio,
  Send,
  TrendingUp,
  Users,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { TIER_COLORS, STATUS_COLORS } from '@/lib/constants'
import { formatRelativeDate, formatDate } from '@/lib/utils'
import { AreaChart, Area, ResponsiveContainer, Tooltip, XAxis } from 'recharts'
import { MeetingPrepCard } from './MeetingPrepCard'
import { CommitmentActions } from '@/components/commitments/CommitmentActions'
import type { CommitmentUrgency } from '@/types'

interface DashboardProps {
  data: {
    totalContacts: number
    overdueCount: number
    overdueTier1: number
    overdueTier2: number
    overdueTier3: number
    openCommitmentsCount: number
    outreachReadyCount: number
    inboxPending: number
    inboxPreview: Array<{
      id: string
      source: string
      itemType: string
      contactName: string
      summary: string
      createdAt: string
    }>
    contacted7d: number
    contacted30d: number
    outreachSentThisWeek: number
    weeklyTrends: Array<{ week: string; interactions: number; outreach: number }>
    todaysMeetings: Array<{
      id: string
      summary: string
      start: string
      end: string
      location: string | null
      matchedContactId: string | null
      matchedContactName: string | null
      matchedContactTier: number | null
      linkedEventId: string | null
      linkedEventName: string | null
    }>
    calendarLoad: 'light' | 'normal' | 'heavy'
    calendarMeetingCount: number
    meetingPreps: Array<{
      id: string
      date: string
      contactId: string
      calendarEventId: string | null
      meetingTitle: string | null
      briefContent: string
      generatedAt: string
    }>
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
      id: string
      description: string
      dueDate: string | null
      contactName: string
      contactId: string
      interactionDate: string
      daysOverdue: number | null
      urgency: CommitmentUrgency
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
    roleTransition: {
      currentRole: string
      currentRoleLabel: string
      daysRemaining: number
      nextRole: string
      nextRoleLabel: string
      hawleyWindowCount: number
    } | null
    personalStats: {
      total: number
      ringCounts: { close: number; regular: number; outer: number; new: number }
      overdueCount: number
    }
    overduePersonal: Array<{
      id: string
      name: string
      ring: string
      daysSince: number | null
      cadence: number
      city: string | null
      howWeMet: string | null
    }>
    upcomingBirthdays: Array<{
      id: string
      contactName: string
      contactId: string
      description: string
      eventDate: string | null
      recurring: boolean
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
      {/* Role Transition Banner */}
      {data.roleTransition && (
        <div className={cn(
          'rounded-lg border p-4',
          data.roleTransition.daysRemaining > 14 ? 'bg-blue-50 border-blue-200' :
          data.roleTransition.daysRemaining > 7 ? 'bg-amber-50 border-amber-200' :
          'bg-red-50 border-red-200'
        )}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Clock className={cn(
                'h-5 w-5',
                data.roleTransition.daysRemaining > 14 ? 'text-blue-600' :
                data.roleTransition.daysRemaining > 7 ? 'text-amber-600' :
                'text-red-600'
              )} />
              <div>
                <p className={cn(
                  'font-semibold text-sm',
                  data.roleTransition.daysRemaining > 14 ? 'text-blue-800' :
                  data.roleTransition.daysRemaining > 7 ? 'text-amber-800' :
                  'text-red-800'
                )}>
                  {data.roleTransition.daysRemaining} days remaining in Hawley office
                </p>
                <p className="text-xs text-gray-600 mt-0.5">
                  {data.roleTransition.hawleyWindowCount} contacts flagged as &ldquo;now_hawley&rdquo; timing &middot; CFTC Deputy GC starts {data.roleTransition.daysRemaining <= 0 ? 'soon' : `in ${data.roleTransition.daysRemaining + 3} days`}
                </p>
              </div>
            </div>
            <Link href="/contacts?timing=now_hawley" className={cn(
              'text-xs font-medium hover:underline',
              data.roleTransition.daysRemaining > 14 ? 'text-blue-600' :
              data.roleTransition.daysRemaining > 7 ? 'text-amber-600' :
              'text-red-600'
            )}>
              View list &rarr;
            </Link>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{greeting}, Stephen</h1>
          <p className="text-sm text-gray-500 mt-0.5">{dateStr}</p>
        </div>
        <div className="flex flex-wrap gap-3 sm:gap-4 text-sm">
          <span className={cn(
            'font-medium',
            data.calendarLoad === 'heavy' ? 'text-red-600' : data.calendarLoad === 'normal' ? 'text-amber-600' : 'text-green-600'
          )}>
            {data.calendarMeetingCount} meetings today
          </span>
          <span className="text-red-600 font-medium">{data.overdueCount} overdue</span>
          <span className="text-amber-600 font-medium">{data.openCommitmentsCount} commitments</span>
          <span className="text-blue-600 font-medium">{data.outreachReadyCount} outreach ready</span>
          {data.inboxPending > 0 && (
            <Link href="/inbox" className="text-purple-600 font-medium hover:text-purple-700">
              {data.inboxPending} inbox pending
            </Link>
          )}
        </div>
      </div>

      {/* Inbox Widget */}
      {data.inboxPending > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Inbox className="h-5 w-5 text-purple-600" />
              Inbox
              <span className="ml-1 rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700">
                {data.inboxPending} pending
              </span>
            </h2>
            <Link href="/inbox" className="text-sm text-purple-600 hover:text-purple-700 flex items-center gap-1">
              Review all <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="grid gap-2">
            {data.inboxPreview.map(item => (
              <Link key={item.id} href="/inbox" className="rounded-lg border bg-white p-3 hover:bg-gray-50 transition-colors block">
                <div className="flex items-center gap-3">
                  <span className="rounded bg-purple-50 px-1.5 py-0.5 text-xs font-medium text-purple-600">
                    {item.source === 'email' ? 'Email' : item.source === 'voice' ? 'Voice' : item.source === 'manual' ? 'Manual' : item.source}
                  </span>
                  <span className="text-sm font-medium text-gray-900">{item.contactName}</span>
                  <span className="text-xs text-gray-400 ml-auto">
                    {formatRelativeDate(item.createdAt)}
                  </span>
                </div>
                {item.summary && (
                  <p className="text-sm text-gray-500 mt-1 truncate">{item.summary}</p>
                )}
              </Link>
            ))}
            {data.inboxPending > 3 && (
              <Link href="/inbox" className="text-center text-sm text-purple-600 hover:text-purple-700 py-2">
                +{data.inboxPending - 3} more pending items
              </Link>
            )}
          </div>
        </section>
      )}

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

      {/* Today's Meetings */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Calendar className="h-5 w-5 text-indigo-600" />
            Today&apos;s Meetings
            <span className={cn(
              'ml-1 rounded-full px-2 py-0.5 text-xs font-medium',
              data.calendarLoad === 'heavy' ? 'bg-red-100 text-red-700' :
              data.calendarLoad === 'normal' ? 'bg-amber-100 text-amber-700' :
              'bg-green-100 text-green-700'
            )}>
              {data.calendarMeetingCount} ({data.calendarLoad})
            </span>
          </h2>
        </div>
        {data.todaysMeetings.length === 0 ? (
          <div className="rounded-lg border bg-white p-4 text-sm text-gray-500">
            No meetings today — clear for outreach
          </div>
        ) : (
          <div className="grid gap-3">
            {data.todaysMeetings.map((meeting) => {
              const prep = data.meetingPreps.find(
                p => p.contactId === meeting.matchedContactId || p.calendarEventId === meeting.id
              )
              return (
                <MeetingPrepCard
                  key={meeting.id}
                  meeting={meeting}
                  existingPrep={prep ? { id: prep.id, briefContent: prep.briefContent, generatedAt: prep.generatedAt } : null}
                />
              )
            })}
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
        {/* Sparkline charts */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
          <div className="rounded-lg border bg-white p-4">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Interactions (8 weeks)</p>
            <div className="h-16">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.weeklyTrends}>
                  <defs>
                    <linearGradient id="interactionGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="week" hide />
                  <Tooltip
                    contentStyle={{ fontSize: 12, border: '1px solid #e5e7eb', borderRadius: 6, padding: '4px 8px' }}
                    labelStyle={{ fontSize: 11, color: '#6b7280' }}
                  />
                  <Area type="monotone" dataKey="interactions" stroke="#3b82f6" strokeWidth={2} fill="url(#interactionGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="rounded-lg border bg-white p-4">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Outreach Sent (8 weeks)</p>
            <div className="h-16">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.weeklyTrends}>
                  <defs>
                    <linearGradient id="outreachGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="week" hide />
                  <Tooltip
                    contentStyle={{ fontSize: 12, border: '1px solid #e5e7eb', borderRadius: 6, padding: '4px 8px' }}
                    labelStyle={{ fontSize: 11, color: '#6b7280' }}
                  />
                  <Area type="monotone" dataKey="outreach" stroke="#10b981" strokeWidth={2} fill="url(#outreachGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
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
              {data.openCommitments.slice(0, 5).map((commitment) => (
                <div key={commitment.id} className="p-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm text-gray-900">{commitment.description}</p>
                        <span className={cn(
                          'rounded px-1.5 py-0.5 text-xs font-medium whitespace-nowrap',
                          commitment.urgency === 'overdue' ? 'bg-red-50 text-red-600' :
                          commitment.urgency === 'today' ? 'bg-amber-50 text-amber-600' :
                          commitment.urgency === 'this_week' ? 'bg-blue-50 text-blue-600' :
                          'bg-gray-50 text-gray-500'
                        )}>
                          {commitment.daysOverdue && commitment.daysOverdue > 0
                            ? `${commitment.daysOverdue}d overdue`
                            : commitment.urgency === 'today' ? 'Today'
                            : commitment.dueDate ? `Due ${formatDate(commitment.dueDate)}`
                            : 'No date'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                        <Link href={`/contacts/${commitment.contactId}`} className="hover:text-blue-600">
                          {commitment.contactName}
                        </Link>
                      </div>
                    </div>
                  </div>
                  <div className="mt-2">
                    <CommitmentActions
                      commitmentId={commitment.id}
                      contactName={commitment.contactName}
                      description={commitment.description}
                      compact
                    />
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

      {/* Social / Personal Section */}
      {data.personalStats.total > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Heart className="h-5 w-5 text-pink-500" />
              Social Circle
            </h2>
            <Link href="/social" className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1">
              Dashboard <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          {/* Ring Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-lg border border-pink-200 bg-pink-50 p-3">
              <p className="text-xs font-medium text-pink-600 uppercase">Close</p>
              <p className="text-xl font-bold text-pink-700">{data.personalStats.ringCounts.close}</p>
            </div>
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
              <p className="text-xs font-medium text-blue-600 uppercase">Regular</p>
              <p className="text-xl font-bold text-blue-700">{data.personalStats.ringCounts.regular}</p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <p className="text-xs font-medium text-gray-500 uppercase">Outer</p>
              <p className="text-xl font-bold text-gray-600">{data.personalStats.ringCounts.outer}</p>
            </div>
            <div className="rounded-lg border border-green-200 bg-green-50 p-3">
              <p className="text-xs font-medium text-green-600 uppercase">New</p>
              <p className="text-xl font-bold text-green-700">{data.personalStats.ringCounts.new}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Overdue Friends */}
            <section>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-700">
                  Overdue Friends ({data.personalStats.overdueCount})
                </h3>
                <Link href="/social/friends?overdue=true" className="text-xs text-blue-600 hover:text-blue-700">
                  View all
                </Link>
              </div>
              {data.overduePersonal.length === 0 ? (
                <div className="rounded-lg border bg-white p-4 text-sm text-gray-500">All friends up to date</div>
              ) : (
                <div className="rounded-lg border bg-white divide-y">
                  {data.overduePersonal.slice(0, 5).map((friend) => (
                    <Link key={friend.id} href={`/contacts/${friend.id}`} className="flex items-center justify-between p-3 hover:bg-gray-50">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={cn(
                          'inline-flex h-5 items-center rounded border px-1.5 text-xs font-medium',
                          friend.ring === 'close' ? 'bg-pink-50 text-pink-700 border-pink-200' :
                          friend.ring === 'regular' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                          friend.ring === 'outer' ? 'bg-gray-50 text-gray-600 border-gray-200' :
                          'bg-green-50 text-green-700 border-green-200'
                        )}>
                          {friend.ring}
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{friend.name}</p>
                          {friend.city && <p className="text-xs text-gray-500 truncate">{friend.city}</p>}
                        </div>
                      </div>
                      <span className="text-xs text-red-500 font-medium whitespace-nowrap ml-2">
                        {friend.daysSince !== null ? `${friend.daysSince}d` : 'Never'} / {friend.cadence}d
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </section>

            {/* Upcoming Birthdays / Life Events */}
            <section>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-700">
                  Upcoming Life Events
                </h3>
                <Link href="/social" className="text-xs text-blue-600 hover:text-blue-700">
                  View all
                </Link>
              </div>
              {data.upcomingBirthdays.length === 0 ? (
                <div className="rounded-lg border bg-white p-4 text-sm text-gray-500">No upcoming events in next 14 days</div>
              ) : (
                <div className="rounded-lg border bg-white divide-y">
                  {data.upcomingBirthdays.slice(0, 5).map((event) => (
                    <Link key={event.id} href={`/contacts/${event.contactId}`} className="flex items-center justify-between p-3 hover:bg-gray-50">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{event.contactName}</p>
                        <p className="text-xs text-gray-500 truncate">{event.description}</p>
                      </div>
                      {event.eventDate && (
                        <span className="text-xs text-gray-500 ml-2 whitespace-nowrap">
                          {formatDate(event.eventDate)}
                        </span>
                      )}
                    </Link>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      )}
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
