'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, X, Users } from 'lucide-react'

interface OverdueContact {
  id: string
  name: string
  ring: string
  daysSince: number | null
  cadence: number
  howWeMet: string | null
  city: string | null
}

interface MomentumContact {
  id: string
  name: string
  ring: string
  last30: number
  avgPerWeek: number
}

interface SocialData {
  totalPersonal: number
  overduePersonal: OverdueContact[]
  upcomingEvents: { id: string; contactName: string; contactId: string; description: string; eventType: string; eventDate: string | null; recurring: boolean }[]
  recentEvents: { id: string; title: string | null; eventType: string; date: string; attendeeCount: number; attendeeNames: string[] }[]
  ringCounts: { close: number; regular: number; outer: number; new: number }
  groups: { id: string; name: string; memberCount: number }[]
  momentum: {
    trendSummary: { growing: number; stable: number; fading: number; totalMessages30d: number }
    growingContacts: MomentumContact[]
    fadingContacts: MomentumContact[]
  }
  groupSuggestions: Array<{
    memberIds: string[]
    memberNames: string[]
    suggestedName: string
    sharedChatCount: number
  }>
  upcomingPlans: Array<{
    id: string
    planType: string
    targetDate: string
    status: string
    contactCount: number
    venueName: string | null
  }>
  nudgeSummary: {
    pendingCount: number
    completedToday: number
    streak: number
  }
}

const RING_COLORS: Record<string, string> = {
  close: 'bg-purple-100 text-purple-700',
  regular: 'bg-blue-100 text-blue-700',
  outer: 'bg-gray-100 text-gray-700',
  new: 'bg-green-100 text-green-700',
}

const EVENT_ICONS: Record<string, string> = {
  happy_hour: '🍺',
  dinner: '🍽️',
  party: '🎉',
  activity: '⚡',
  other: '📅',
}

export function SocialDashboardContent({ data }: { data: SocialData }) {
  const router = useRouter()
  const [hiddenSuggestions, setHiddenSuggestions] = useState<Set<number>>(new Set())
  const [accepting, setAccepting] = useState<number | null>(null)

  const handleAcceptGroup = async (idx: number, suggestion: SocialData['groupSuggestions'][0]) => {
    setAccepting(idx)
    try {
      await fetch('/api/social/group-suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'accept',
          memberIds: suggestion.memberIds,
          groupName: suggestion.suggestedName,
        }),
      })
      router.refresh()
    } catch (err) {
      console.error('Group suggestion error:', err)
    }
    setAccepting(null)
  }

  const visibleSuggestions = data.groupSuggestions.filter((_, i) => !hiddenSuggestions.has(i))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Social Dashboard</h1>
        <div className="flex gap-2">
          <Link href="/social/assistant" className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700">
            Ask Assistant
          </Link>
          <Link href="/social/nudges" className="rounded-md bg-amber-600 px-3 py-2 text-sm font-medium text-white hover:bg-amber-700 relative">
            Nudges
            {data.nudgeSummary.pendingCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                {data.nudgeSummary.pendingCount}
              </span>
            )}
          </Link>
          <Link href="/social/plans" className="rounded-md bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700">
            Plans
          </Link>
          <Link href="/social/friends/new" className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700">
            Add Friend
          </Link>
          <Link href="/social/events" className="rounded-md bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200">
            Plan Event
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Object.entries(data.ringCounts).map(([ring, count]) => (
          <Link key={ring} href={`/social/friends?ring=${ring}`} className="rounded-lg bg-white p-4 shadow-sm hover:shadow-md transition-shadow">
            <div className="text-2xl font-bold text-gray-900">{count}</div>
            <div className="text-sm text-gray-500 capitalize">{ring} friends</div>
          </Link>
        ))}
      </div>

      {/* Communication Momentum */}
      <div className="rounded-lg bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Communication Momentum</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">{data.momentum.trendSummary.growing}</div>
            <div className="text-xs text-gray-500">Growing</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-600">{data.momentum.trendSummary.stable}</div>
            <div className="text-xs text-gray-500">Stable</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-orange-600">{data.momentum.trendSummary.fading}</div>
            <div className="text-xs text-gray-500">Fading</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">{data.momentum.trendSummary.totalMessages30d.toLocaleString()}</div>
            <div className="text-xs text-gray-500">Msgs (30d)</div>
          </div>
        </div>
        {(data.momentum.growingContacts.length > 0 || data.momentum.fadingContacts.length > 0) && (
          <div className="grid md:grid-cols-2 gap-4">
            {/* Fastest Growing */}
            <div>
              <h3 className="text-xs font-semibold uppercase text-green-600 mb-2">📈 Fastest Growing</h3>
              {data.momentum.growingContacts.length === 0 ? (
                <p className="text-xs text-gray-400 italic">No growing trends</p>
              ) : (
                <div className="space-y-1.5">
                  {data.momentum.growingContacts.map(c => (
                    <Link key={c.id} href={`/contacts/${c.id}`} className="flex items-center justify-between rounded p-1.5 hover:bg-gray-50 text-sm">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900">{c.name}</span>
                        <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${RING_COLORS[c.ring] || RING_COLORS.new}`}>
                          {c.ring}
                        </span>
                      </div>
                      <span className="text-xs text-green-600 font-medium">{c.last30} msgs</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
            {/* At Risk / Fading */}
            <div>
              <h3 className="text-xs font-semibold uppercase text-orange-600 mb-2">📉 At Risk</h3>
              {data.momentum.fadingContacts.length === 0 ? (
                <p className="text-xs text-gray-400 italic">No fading trends</p>
              ) : (
                <div className="space-y-1.5">
                  {data.momentum.fadingContacts.map(c => (
                    <Link key={c.id} href={`/contacts/${c.id}`} className="flex items-center justify-between rounded p-1.5 hover:bg-gray-50 text-sm">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900">{c.name}</span>
                        <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${RING_COLORS[c.ring] || RING_COLORS.new}`}>
                          {c.ring}
                        </span>
                      </div>
                      <span className="text-xs text-orange-600 font-medium">{c.last30} msgs</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Today's Nudges */}
      {(data.nudgeSummary.pendingCount > 0 || data.nudgeSummary.completedToday > 0) && (
        <div className="rounded-lg bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-gray-900">Today&apos;s Reach-Outs</h2>
            <Link href="/social/nudges" className="text-sm text-amber-600 hover:text-amber-800">View all</Link>
          </div>
          <div className="flex items-center gap-6">
            {data.nudgeSummary.pendingCount > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-2xl font-bold text-amber-600">{data.nudgeSummary.pendingCount}</span>
                <span className="text-sm text-gray-500">pending</span>
              </div>
            )}
            {data.nudgeSummary.completedToday > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-2xl font-bold text-green-600">{data.nudgeSummary.completedToday}</span>
                <span className="text-sm text-gray-500">done today</span>
              </div>
            )}
            {data.nudgeSummary.streak > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-2xl font-bold text-indigo-600">{data.nudgeSummary.streak}</span>
                <span className="text-sm text-gray-500">day streak</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Upcoming Plans */}
      {data.upcomingPlans.length > 0 && (
        <div className="rounded-lg bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-gray-900">Upcoming Plans</h2>
            <Link href="/social/plans" className="text-sm text-blue-600 hover:text-blue-800">View all</Link>
          </div>
          <div className="space-y-2">
            {data.upcomingPlans.map(p => {
              const icons: Record<string, string> = { happy_hour: '🍺', golf: '⛳', dinner: '🍽️', party: '🎉' }
              const labels: Record<string, string> = { happy_hour: 'Happy Hour', golf: 'Golf', dinner: 'Dinner', party: 'Party' }
              return (
                <Link key={p.id} href="/social/plans" className="flex items-center justify-between p-2 rounded hover:bg-gray-50">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{icons[p.planType] || '📅'}</span>
                    <div>
                      <div className="font-medium text-gray-900">{labels[p.planType] || p.planType}</div>
                      <div className="text-xs text-gray-500">
                        {new Date(p.targetDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                        {p.venueName && ` · ${p.venueName}`}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${p.status === 'approved' ? 'bg-blue-100 text-blue-700' : 'bg-yellow-100 text-yellow-700'}`}>
                      {p.status}
                    </span>
                    <div className="text-xs text-gray-400 mt-0.5">{p.contactCount} people</div>
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        {/* Overdue Friends */}
        <div className="rounded-lg bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Overdue Friends</h2>
            <span className="text-sm text-red-600 font-medium">{data.overduePersonal.length} overdue</span>
          </div>
          {data.overduePersonal.length === 0 ? (
            <p className="text-sm text-gray-500">All caught up!</p>
          ) : (
            <div className="space-y-3 max-h-80 overflow-y-auto">
              {data.overduePersonal.slice(0, 10).map(c => (
                <Link key={c.id} href={`/contacts/${c.id}`} className="flex items-center justify-between p-2 rounded hover:bg-gray-50">
                  <div>
                    <div className="font-medium text-gray-900">{c.name}</div>
                    <div className="text-xs text-gray-500">
                      {c.city || 'No city'} {c.howWeMet ? `· ${c.howWeMet}` : ''}
                    </div>
                  </div>
                  <div className="text-right">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${RING_COLORS[c.ring] || RING_COLORS.new}`}>
                      {c.ring}
                    </span>
                    <div className="text-xs text-red-600 mt-0.5">
                      {c.daysSince !== null ? `${c.daysSince}d / ${c.cadence}d` : 'Never contacted'}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Upcoming Life Events */}
        <div className="rounded-lg bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Upcoming Life Events</h2>
          {data.upcomingEvents.length === 0 ? (
            <p className="text-sm text-gray-500">No upcoming events in the next 14 days</p>
          ) : (
            <div className="space-y-3">
              {data.upcomingEvents.map(e => (
                <Link key={e.id} href={`/contacts/${e.contactId}`} className="flex items-center gap-3 p-2 rounded hover:bg-gray-50">
                  <div className="text-xl">{e.eventType === 'birthday' ? '🎂' : '📌'}</div>
                  <div>
                    <div className="font-medium text-gray-900">{e.contactName}</div>
                    <div className="text-xs text-gray-500">{e.description}</div>
                    {e.eventDate && <div className="text-xs text-blue-600">{e.eventDate}</div>}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Recent Social Events */}
        <div className="rounded-lg bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Recent Events</h2>
            <Link href="/social/events" className="text-sm text-blue-600 hover:text-blue-800">View all</Link>
          </div>
          {data.recentEvents.length === 0 ? (
            <p className="text-sm text-gray-500">No social events yet</p>
          ) : (
            <div className="space-y-3">
              {data.recentEvents.map(e => (
                <div key={e.id} className="flex items-center gap-3 p-2">
                  <div className="text-xl">{EVENT_ICONS[e.eventType] || EVENT_ICONS.other}</div>
                  <div className="flex-1">
                    <div className="font-medium text-gray-900">{e.title || e.eventType}</div>
                    <div className="text-xs text-gray-500">{e.date} · {e.attendeeCount} people</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Groups */}
        <div className="rounded-lg bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Groups</h2>
            <Link href="/social/groups" className="text-sm text-blue-600 hover:text-blue-800">Manage</Link>
          </div>
          <div className="space-y-2">
            {data.groups.map(g => (
              <Link key={g.id} href={`/social/friends?group=${g.id}`} className="flex items-center justify-between p-2 rounded hover:bg-gray-50">
                <span className="font-medium text-gray-900">{g.name}</span>
                <span className="text-sm text-gray-500">{g.memberCount} members</span>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Suggested Groups */}
      {visibleSuggestions.length > 0 && (
        <div className="rounded-lg bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Users className="h-5 w-5 text-indigo-500" />
            <h2 className="text-lg font-semibold text-gray-900">Suggested Groups</h2>
            <span className="text-xs text-gray-400">from group chat patterns</span>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {data.groupSuggestions.map((sg, idx) => {
              if (hiddenSuggestions.has(idx)) return null
              return (
                <div key={idx} className="rounded-lg border border-indigo-100 bg-indigo-50/30 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold text-gray-900">{sg.suggestedName}</span>
                    <span className="text-[10px] text-indigo-500 font-medium">{sg.sharedChatCount} shared chats</span>
                  </div>
                  <div className="flex flex-wrap gap-1 mb-3">
                    {sg.memberNames.map((name, i) => (
                      <span key={i} className="rounded bg-white px-2 py-0.5 text-xs text-gray-700 border border-gray-200">
                        {name}
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleAcceptGroup(idx, sg)}
                      disabled={accepting === idx}
                      className="flex-1 flex items-center justify-center gap-1 rounded bg-indigo-600 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                    >
                      <Check className="h-3 w-3" />
                      {accepting === idx ? 'Creating...' : 'Create Group'}
                    </button>
                    <button
                      onClick={() => setHiddenSuggestions(prev => new Set(prev).add(idx))}
                      className="rounded border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-50"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
