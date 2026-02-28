'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Calendar,
  Edit,
  ExternalLink,
  Globe,
  Linkedin,
  Mail,
  MessageSquare,
  Phone,
  Send,
  Twitter,
  Users,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { TIER_COLORS, TIER_LABELS, STATUS_COLORS, STATUS_LABELS } from '@/lib/constants'
import { formatDate, formatRelativeDate } from '@/lib/utils'

interface Props {
  contact: {
    id: string
    name: string
    title: string | null
    organization: string | null
    email: string | null
    phone: string | null
    linkedinUrl: string | null
    twitterHandle: string | null
    personalWebsite: string | null
    tier: number
    categories: string[]
    tags: string[]
    status: string
    targetCadenceDays: number
    lastInteractionDate: string | null
    daysSinceInteraction: number | null
    isOverdue: boolean
    relationshipStrength: number
    strategicValue: number
    introductionPathway: string | null
    connectionToHawleyOrbit: string | null
    whyTheyMatter: string | null
    notes: string | null
    interactions: Array<{
      id: string
      type: string
      date: string
      summary: string | null
      commitments: Array<{ description: string; due_date: string | null; fulfilled: boolean }>
      followUpRequired: boolean
      followUpDescription: string | null
      followUpCompleted: boolean
    }>
    signals: Array<{
      id: string
      signalType: string
      title: string
      detectedAt: string
      sourceName: string | null
      sourceUrl: string | null
    }>
    outreachItems: Array<{
      id: string
      status: string
      triggerDescription: string
      draftSubject: string | null
      createdAt: string
      sentAt: string | null
    }>
  }
  relationships: Array<{
    id: string
    contactAId: string
    contactBId: string
    relationshipType: string | null
    strength: number
  }>
  relatedContacts: Array<{
    id: string
    name: string
    organization: string | null
    tier: number
  }>
}

export function ContactDetailContent({ contact, relationships, relatedContacts }: Props) {
  const router = useRouter()

  const openCommitments = contact.interactions
    .flatMap(i => i.commitments.filter(c => !c.fulfilled).map(c => ({
      ...c,
      interactionDate: i.date,
    })))

  return (
    <div className="max-w-6xl mx-auto">
      {/* Back + Actions */}
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => router.back()} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        <div className="flex gap-2">
          <Link href={`/outreach?contact=${contact.id}`} className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700">
            <Send className="h-4 w-4" />
            Draft Outreach
          </Link>
          <Link href={`/interactions/new?contact=${contact.id}`} className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
            <MessageSquare className="h-4 w-4" />
            Log Interaction
          </Link>
          <Link href={`/contacts/${contact.id}/edit`} className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
            <Edit className="h-4 w-4" />
            Edit
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Left Column (60%) */}
        <div className="lg:col-span-3 space-y-6">
          {/* Header */}
          <div className="rounded-lg border bg-white p-6">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-bold text-gray-900">{contact.name}</h1>
                  <span className={cn('inline-flex h-6 items-center rounded border px-2 text-xs font-medium', TIER_COLORS[contact.tier])}>
                    {TIER_LABELS[contact.tier]}
                  </span>
                  <div className="flex items-center gap-1">
                    <span className={cn('h-2 w-2 rounded-full', STATUS_COLORS[contact.status] || 'bg-gray-300')} />
                    <span className="text-xs text-gray-500">{STATUS_LABELS[contact.status]}</span>
                  </div>
                </div>
                {contact.title && <p className="text-gray-600 mt-1">{contact.title}</p>}
                {contact.organization && <p className="text-gray-500">{contact.organization}</p>}
              </div>
              <div className="text-right">
                <p className={cn('text-sm font-medium', contact.isOverdue ? 'text-red-500' : 'text-gray-500')}>
                  {contact.daysSinceInteraction !== null ? `${contact.daysSinceInteraction} days` : 'Never contacted'}
                </p>
                <p className="text-xs text-gray-400">Cadence: every {contact.targetCadenceDays}d</p>
              </div>
            </div>
          </div>

          {/* About Section */}
          {(contact.whyTheyMatter || contact.connectionToHawleyOrbit || contact.introductionPathway || contact.notes) && (
            <div className="rounded-lg border bg-white p-6 space-y-4">
              {contact.whyTheyMatter && (
                <div>
                  <h3 className="text-xs font-semibold uppercase text-gray-400 mb-1">Why They Matter</h3>
                  <p className="text-sm text-gray-700">{contact.whyTheyMatter}</p>
                </div>
              )}
              {contact.connectionToHawleyOrbit && (
                <div>
                  <h3 className="text-xs font-semibold uppercase text-gray-400 mb-1">Connection to Hawley Orbit</h3>
                  <p className="text-sm text-gray-700">{contact.connectionToHawleyOrbit}</p>
                </div>
              )}
              {contact.introductionPathway && (
                <div>
                  <h3 className="text-xs font-semibold uppercase text-gray-400 mb-1">Introduction Pathway</h3>
                  <p className="text-sm text-gray-700">{contact.introductionPathway}</p>
                </div>
              )}
              {contact.notes && (
                <div>
                  <h3 className="text-xs font-semibold uppercase text-gray-400 mb-1">Notes</h3>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{contact.notes}</p>
                </div>
              )}
            </div>
          )}

          {/* Open Commitments */}
          {openCommitments.length > 0 && (
            <div className="rounded-lg border bg-white p-6">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Open Commitments</h3>
              <div className="space-y-2">
                {openCommitments.map((c, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className="text-gray-700">{c.description}</span>
                    <span className="text-xs text-gray-400">{c.due_date ? `Due ${formatDate(c.due_date)}` : `From ${formatDate(c.interactionDate)}`}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Interaction Timeline */}
          <div className="rounded-lg border bg-white p-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Interaction History</h3>
            {contact.interactions.length === 0 ? (
              <p className="text-sm text-gray-500">No interactions logged yet</p>
            ) : (
              <div className="space-y-3">
                {contact.interactions.map(interaction => (
                  <div key={interaction.id} className="border-l-2 border-gray-200 pl-4 pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-600">
                          {interaction.type.replace(/_/g, ' ')}
                        </span>
                        <span className="text-xs text-gray-400">{formatDate(interaction.date)}</span>
                      </div>
                      {interaction.followUpRequired && !interaction.followUpCompleted && (
                        <span className="rounded bg-amber-50 px-1.5 py-0.5 text-xs text-amber-600">Follow-up needed</span>
                      )}
                    </div>
                    {interaction.summary && (
                      <p className="text-sm text-gray-600 mt-1">{interaction.summary}</p>
                    )}
                    {interaction.commitments.length > 0 && (
                      <div className="mt-1">
                        {interaction.commitments.map((c, ci) => (
                          <p key={ci} className={cn('text-xs', c.fulfilled ? 'text-green-600 line-through' : 'text-amber-600')}>
                            Commitment: {c.description}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column (40%) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Contact Info */}
          <div className="rounded-lg border bg-white p-6">
            <h3 className="text-xs font-semibold uppercase text-gray-400 mb-3">Contact Info</h3>
            <div className="space-y-2">
              {contact.email && (
                <a href={`mailto:${contact.email}`} className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700">
                  <Mail className="h-4 w-4" /> {contact.email}
                </a>
              )}
              {contact.phone && (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Phone className="h-4 w-4" /> {contact.phone}
                </div>
              )}
              {contact.linkedinUrl && (
                <a href={contact.linkedinUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700">
                  <Linkedin className="h-4 w-4" /> LinkedIn <ExternalLink className="h-3 w-3" />
                </a>
              )}
              {contact.twitterHandle && (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Twitter className="h-4 w-4" /> @{contact.twitterHandle}
                </div>
              )}
              {contact.personalWebsite && (
                <a href={contact.personalWebsite} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700">
                  <Globe className="h-4 w-4" /> Website <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          </div>

          {/* Classification */}
          <div className="rounded-lg border bg-white p-6">
            <h3 className="text-xs font-semibold uppercase text-gray-400 mb-3">Classification</h3>
            {contact.categories.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-3">
                {contact.categories.map(cat => (
                  <span key={cat} className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">{cat}</span>
                ))}
              </div>
            )}
            {contact.tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {contact.tags.map(tag => (
                  <span key={tag} className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-500">#{tag}</span>
                ))}
              </div>
            )}
          </div>

          {/* Scores */}
          <div className="rounded-lg border bg-white p-6">
            <h3 className="text-xs font-semibold uppercase text-gray-400 mb-3">Scores</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-gray-500">Relationship</p>
                <p className="text-2xl font-bold text-gray-900">{contact.relationshipStrength.toFixed(1)}</p>
                <div className="mt-1 h-1.5 rounded-full bg-gray-100">
                  <div className="h-full rounded-full bg-green-500" style={{ width: `${contact.relationshipStrength * 10}%` }} />
                </div>
              </div>
              <div>
                <p className="text-xs text-gray-500">Strategic Value</p>
                <p className="text-2xl font-bold text-gray-900">{contact.strategicValue.toFixed(1)}</p>
                <div className="mt-1 h-1.5 rounded-full bg-gray-100">
                  <div className="h-full rounded-full bg-blue-500" style={{ width: `${contact.strategicValue * 10}%` }} />
                </div>
              </div>
            </div>
          </div>

          {/* Signals */}
          <div className="rounded-lg border bg-white p-6">
            <h3 className="text-xs font-semibold uppercase text-gray-400 mb-3">Intelligence Signals</h3>
            {contact.signals.length === 0 ? (
              <p className="text-sm text-gray-500">No signals</p>
            ) : (
              <div className="space-y-2">
                {contact.signals.map(signal => (
                  <div key={signal.id} className="text-sm">
                    <div className="flex items-center justify-between">
                      <span className="rounded bg-violet-50 px-1.5 py-0.5 text-xs text-violet-600">
                        {signal.signalType.replace(/_/g, ' ')}
                      </span>
                      <span className="text-xs text-gray-400">{formatRelativeDate(signal.detectedAt)}</span>
                    </div>
                    <p className="text-gray-700 mt-0.5">{signal.title}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Network Connections */}
          {relatedContacts.length > 0 && (
            <div className="rounded-lg border bg-white p-6">
              <h3 className="text-xs font-semibold uppercase text-gray-400 mb-3">Network Connections</h3>
              <div className="space-y-2">
                {relatedContacts.map(rc => {
                  const rel = relationships.find(r =>
                    (r.contactAId === contact.id && r.contactBId === rc.id) ||
                    (r.contactBId === contact.id && r.contactAId === rc.id)
                  )
                  return (
                    <Link key={rc.id} href={`/contacts/${rc.id}`} className="flex items-center justify-between text-sm hover:bg-gray-50 rounded p-1 -mx-1">
                      <div className="flex items-center gap-2">
                        <span className={cn('inline-flex h-4 items-center rounded px-1 text-xs', TIER_COLORS[rc.tier])}>T{rc.tier}</span>
                        <span className="text-gray-900">{rc.name}</span>
                      </div>
                      <span className="text-xs text-gray-400">{rel?.relationshipType?.replace(/_/g, ' ')}</span>
                    </Link>
                  )
                })}
              </div>
              <Link href="/network" className="block mt-2 text-xs text-blue-600 hover:text-blue-700">View in Network Map</Link>
            </div>
          )}

          {/* Outreach History */}
          {contact.outreachItems.length > 0 && (
            <div className="rounded-lg border bg-white p-6">
              <h3 className="text-xs font-semibold uppercase text-gray-400 mb-3">Outreach History</h3>
              <div className="space-y-2">
                {contact.outreachItems.map(item => (
                  <div key={item.id} className="text-sm">
                    <div className="flex items-center justify-between">
                      <span className={cn(
                        'rounded px-1.5 py-0.5 text-xs',
                        item.status === 'sent' ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-500'
                      )}>
                        {item.status}
                      </span>
                      <span className="text-xs text-gray-400">{formatDate(item.sentAt || item.createdAt)}</span>
                    </div>
                    {item.draftSubject && <p className="text-gray-600 mt-0.5 text-xs">{item.draftSubject}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
