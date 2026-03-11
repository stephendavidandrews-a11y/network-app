'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  Calendar,
  ChevronDown,
  ChevronUp,
  Edit,
  ExternalLink,
  FileText,
  Globe,
  Linkedin,
  Loader2,
  Mail,
  MessageSquare,
  Mic,
  Phone,
  RefreshCw,
  Send,
  Twitter,
  Trash2,
  GitMerge,
  Search,
  X,
  Users,
  GitPullRequest,
  ArrowRight,
  Building2,
  Heart,
  Home,
  MapPin,
  Tag,
  Plus,
  Sparkles,
  Pencil,
  Copy,
  Check,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { TIER_COLORS, TIER_LABELS, STATUS_COLORS, STATUS_LABELS } from '@/lib/constants'
import { formatDate, formatRelativeDate } from '@/lib/utils'
import { CommitmentActions } from '@/components/commitments/CommitmentActions'
import { InviteToEventButton } from '@/components/social/InviteToEventButton'

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
    outreachMode: string
    accessibility: string
    outreachTiming: string | null
    pathwayNotes: string | null
    pathwayScore: number
    hawleyPretext: string | null
    cftcPretext: string | null
    pretexts: Array<{
      id: string
      pretextType: string
      hook: string
      strength: string
      validFrom: string | null
      validUntil: string | null
      used: boolean
    }>
    orgContacts: Array<{
      id: string
      name: string
      title: string | null
      status: string
      relationshipStrength: number
    }>
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
  commitments: Array<{
    id: string
    interactionId: string
    contactId: string
    description: string
    dueDate: string | null
    fulfilled: boolean
    fulfilledDate: string | null
    fulfilledNotes: string | null
    reminderSnoozedUntil: string | null
    createdAt: string
  }>
  latestPrep: {
    id: string
    briefContent: string
    generatedAt: string
    meetingTitle: string | null
  } | null
  dossier: {
    id: string
    version: number
    content: string
    updatedBy: string
    createdAt: string
  } | null
  standingOffers: Array<{
    id: string
    description: string
    offeredBy: string
    originalWords: string
    createdAt: string
  }>
  provenanceAsDiscovered: Array<{
    id: string
    type: string
    sourceContactId: string
    sourceContactName: string
    sourceContactOrg: string | null
    notes: string | null
    createdAt: string
  }>
  provenanceAsSource: Array<{
    id: string
    type: string
    contactId: string
    contactName: string
    contactOrg: string | null
    contactTitle: string | null
    createdAt: string
  }>
  alsoAtOrg: Array<{
    id: string
    name: string
    title: string | null
    tier: number
  }>
  personalData: {
    contactType: string
    personalRing: string | null
    personalCadenceDays: number | null
    howWeMet: string | null
    city: string | null
    neighborhood: string | null
    streetAddress: string | null
    stateRegion: string | null
    zipCode: string | null
    communicationPref: string | null
    partnerName: string | null
    kids: string | null
    dietaryNotes: string | null
    availabilityNotes: string | null
    emotionalContext: string | null
    emotionalContextSet: string | null
    reciprocityPattern: string | null
    funnelStage: string | null
    interests: Array<{ id: string; interest: string; confidence: string }>
    activities: Array<{ id: string; activity: string; frequency: string }>
    groups: Array<{ id: string; name: string }>
    friendRelationships: Array<{ id: string; contactId: string; contactName: string; type: string }>
    socialEvents: Array<{ id: string; title: string | null; date: string; eventType: string; status: string }>
    lifeEvents: Array<{ id: string; description: string; eventDate: string | null; recurring: boolean; eventType: string }>
  } | null
  commStats: {
    totalMessages: number
    messagesSent: number
    messagesReceived: number
    firstMessageDate: string | null
    lastMessageDate: string | null
    avgMessagesPerWeek: number
    last30DayCount: number
    last90DayCount: number
    reciprocityRatio: number
    responseLatencyAvg: number | null
    trend: string
    droppedBall: boolean
    droppedBallSince: string | null
  } | null
  extractionData: {
    factual: {
      interests: Array<{ interest: string; confidence: string; evidence?: string }>
      activities: Array<{ activity: string; frequency: string; confidence: string }>
      lifeEvents: Array<{ description: string; date: string | null; eventType: string }>
      locationSignals: Record<string, { value: string | null; confidence: string }>
      keyPeopleMentioned: Array<{ name: string; relationship: string; context: string }>
      howWeMetSignal: string | null
      typicalTopics: string[]
      availabilityPatterns: string | null
      openThreads: Array<{ description: string; type: string; lastMentioned: string; initiatedBy: string }>
      lastExtracted: string
    } | null
    interpretive: {
      communicationStyle: string | null
      personalityRead: { description: string; confidence: string; traits: string[] } | null
      emotionalAvailability: string | null
      humorStyle: string | null
      reliabilitySignal: string | null
      whatTheyCareAbout: string | null
      howTheySeeYou: string | null
      relationshipArc: string | null
      warmthSignal: string | null
      initiationPattern: string | null
      workingStyle: string | null
      strategicPriorities: string | null
      whatTheyWantFromYou: string | null
      summary: string | null
      preOutreachBrief: string | null
      lastExtracted: string
    } | null
  } | null
  voiceData: {
    profile: {
      formality: string
      typicalLength: string
      humorLevel: string
      emojiUsage: string
      signaturePhrases: string[]
      openerPatterns: string[]
      signOffPatterns: string[]
      styleNotes: string | null
      sampleMessages: string[]
    }
    tier: string
    tierReason: string
    archetype: string | null
    sentMessageCount: number
  } | null
}

export function ContactDetailContent({ contact, relationships, relatedContacts, commitments, latestPrep, dossier, standingOffers, provenanceAsDiscovered, provenanceAsSource, alsoAtOrg, personalData, commStats, extractionData, voiceData }: Props) {
  const router = useRouter()

  const [contactType, setContactType] = useState(personalData ? (personalData.contactType || 'personal') : 'professional')
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [showMergeModal, setShowMergeModal] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [merging, setMerging] = useState(false)
  const [mergeSearch, setMergeSearch] = useState('')
  const [mergeTargets, setMergeTargets] = useState<Array<{id: string; name: string; organization: string | null}>>([])
  const [mergeTargetId, setMergeTargetId] = useState<string | null>(null)
  const [mergeTargetName, setMergeTargetName] = useState('')
  const [draftMode, setDraftMode] = useState<'closed' | 'write' | 'generating' | 'draft' | 'editing' | 'sent'>('closed')
  const [draftText, setDraftText] = useState('')
  const [draftVoiceSource, setDraftVoiceSource] = useState('')
  const [originalDraft, setOriginalDraft] = useState('')
  const [sendingDraft, setSendingDraft] = useState(false)
  const [copySuccess, setCopySuccess] = useState(false)

  const buildHooks = (): string[] => {
    const hooks: string[] = []
    if (personalData?.lifeEvents) {
      const now = new Date()
      for (const le of personalData.lifeEvents) {
        if (le.eventDate) {
          const evDate = new Date(le.eventDate)
          const diff = Math.abs(evDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
          if (diff < 7) hooks.push(`${le.eventType}: ${le.description}`)
        }
      }
    }
    if (contact.signals?.length > 0) {
      hooks.push(contact.signals[0].title)
    }
    if (contact.isOverdue && contact.daysSinceInteraction) {
      hooks.push(`Haven't connected in ${contact.daysSinceInteraction} days`)
    }
    if (contact.interactions?.length > 0 && contact.interactions[0].summary) {
      hooks.push(`Last conversation: ${contact.interactions[0].summary.slice(0, 100)}`)
    }
    return hooks.slice(0, 3)
  }

  const handleAiDraft = async () => {
    setDraftMode('generating')
    setDraftText('')
    try {
      const res = await fetch('/api/social/plans/draft-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contactId: contact.id,
          planType: 'reachout',
          hooks: buildHooks(),
        }),
      })
      const data = await res.json()
      if (res.ok && data.draftText) {
        setDraftText(data.draftText)
        setDraftVoiceSource(data.voiceSource || 'fallback')
        setOriginalDraft(data.draftText)
        setDraftMode('draft')
      } else {
        alert(data.error || 'Failed to generate draft')
        setDraftMode('closed')
      }
    } catch {
      alert('Failed to generate draft')
      setDraftMode('closed')
    }
  }

  const handleDraftSend = async () => {
    if (!confirm(`Send this text to ${contact.name} via iMessage?`)) return
    setSendingDraft(true)
    try {
      // Save correction if user edited an AI draft
      if (originalDraft && draftText !== originalDraft && draftVoiceSource !== 'manual') {
        await fetch('/api/social/nudges', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'save_correction',
            contactId: contact.id,
            originalDraft,
            editedDraft: draftText,
            voiceSource: draftVoiceSource,
          }),
        })
      }
      const res = await fetch('/api/social/nudges', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send', contactId: contact.id, message: draftText }),
      })
      const data = await res.json()
      if (data.success) {
        setDraftMode('sent')
      } else {
        alert(`Send failed: ${data.error || 'Unknown error'}`)
      }
    } catch {
      alert('Failed to send')
    } finally {
      setSendingDraft(false)
    }
  }

  const handleDraftCopy = () => {
    navigator.clipboard.writeText(draftText)
    setCopySuccess(true)
    setTimeout(() => setCopySuccess(false), 2000)
    // Save correction if user edited an AI draft
    if (originalDraft && draftText !== originalDraft && draftVoiceSource !== 'manual') {
      fetch('/api/social/nudges', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save_correction',
          contactId: contact.id,
          originalDraft,
          editedDraft: draftText,
          voiceSource: draftVoiceSource,
        }),
      })
    }
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      const res = await fetch('/api/contacts/' + contact.id, { method: 'DELETE' })
      if (res.ok) { router.push('/contacts') }
      else { alert('Failed to delete contact') }
    } catch { alert('Failed to delete contact') }
    finally { setDeleting(false) }
  }

  const handleMerge = async () => {
    if (!mergeTargetId) return
    setMerging(true)
    try {
      const res = await fetch('/api/contacts/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceId: contact.id, targetId: mergeTargetId }),
      })
      const data = await res.json()
      if (res.ok) { router.push('/contacts/' + mergeTargetId) }
      else { alert(data.error || 'Merge failed') }
    } catch { alert('Merge failed') }
    finally { setMerging(false) }
  }

  const searchMergeTargets = async (q: string) => {
    setMergeSearch(q)
    if (q.length < 2) { setMergeTargets([]); return }
    try {
      const res = await fetch('/api/contacts?search=' + encodeURIComponent(q) + '&limit=10&fields=id,name,organization')
      const data = await res.json()
      setMergeTargets((data.contacts || []).filter((c: any) => c.id !== contact.id))
    } catch { setMergeTargets([]) }
  }

  const handleContactTypeChange = async (newType: string) => {
    setContactType(newType)
    try {
      await fetch(`/api/contacts/${contact.id}/personal`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactType: newType }),
      })
      router.refresh()
    } catch (err) {
      console.error('Failed to update contact type:', err)
    }
  }

  const openCommitments = commitments.filter(c => !c.fulfilled)
  const fulfilledCommitments = commitments.filter(c => c.fulfilled)

  // Extracted Insights block (rendered in left column for personal, right column for professional)
  const extractedInsightsBlock = extractionData && (extractionData.interpretive || extractionData.factual) ? (
    <div className="rounded-lg border bg-white p-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold uppercase text-gray-400 flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-purple-400" />
          Extracted Insights
        </h3>
        {(extractionData.factual?.lastExtracted || extractionData.interpretive?.lastExtracted) && (
          <span className="text-[10px] text-gray-400">
            {formatRelativeDate(extractionData.interpretive?.lastExtracted || extractionData.factual?.lastExtracted || '')}
          </span>
        )}
      </div>
      {extractionData.interpretive?.summary && (
        <p className="text-sm text-gray-700 mb-3">{extractionData.interpretive.summary}</p>
      )}
      {extractionData.interpretive?.preOutreachBrief && (
        <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 mb-3">
          <p className="text-xs font-medium text-blue-700 mb-0.5">Before reaching out:</p>
          <p className="text-sm text-blue-800">{extractionData.interpretive.preOutreachBrief}</p>
        </div>
      )}
      {extractionData.interpretive?.personalityRead && (
        <div className="mb-3">
          <p className="text-xs font-medium text-gray-500 mb-1">Personality</p>
          <p className="text-sm text-gray-700">{extractionData.interpretive.personalityRead.description}</p>
          {extractionData.interpretive.personalityRead.traits?.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {extractionData.interpretive.personalityRead.traits.map((trait: string, i: number) => (
                <span key={i} className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-50 text-purple-600">{trait}</span>
              ))}
            </div>
          )}
        </div>
      )}
      {extractionData.interpretive && (
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          {extractionData.interpretive.relationshipArc && (
            <span className={cn(
              'text-[10px] px-2 py-0.5 rounded-full font-medium',
              extractionData.interpretive.relationshipArc === 'deepening' ? 'bg-green-50 text-green-600' :
              extractionData.interpretive.relationshipArc === 'cooling' ? 'bg-orange-50 text-orange-600' :
              'bg-gray-100 text-gray-600'
            )}>
              {extractionData.interpretive.relationshipArc}
            </span>
          )}
          {extractionData.interpretive.warmthSignal && (
            <span className={cn(
              'text-[10px] px-2 py-0.5 rounded-full font-medium',
              extractionData.interpretive.warmthSignal === 'high' ? 'bg-red-50 text-red-500' :
              extractionData.interpretive.warmthSignal === 'medium' ? 'bg-amber-50 text-amber-600' :
              'bg-gray-100 text-gray-500'
            )}>
              warmth: {extractionData.interpretive.warmthSignal}
            </span>
          )}
          {extractionData.interpretive.communicationStyle && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
              {extractionData.interpretive.communicationStyle}
            </span>
          )}
        </div>
      )}
      {extractionData.factual?.keyPeopleMentioned && extractionData.factual.keyPeopleMentioned.length > 0 && (
        <div className="mb-3">
          <p className="text-xs font-medium text-gray-500 mb-1">Key People</p>
          <div className="space-y-1">
            {extractionData.factual.keyPeopleMentioned.map((p: { name: string; relationship: string }, i: number) => (
              <div key={i} className="flex items-center gap-1.5 text-xs text-gray-600">
                <Users className="h-3 w-3 text-gray-400" />
                <span className="font-medium">{p.name}</span>
                <span className="text-gray-400">({p.relationship})</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {extractionData.factual?.typicalTopics && extractionData.factual.typicalTopics.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-500 mb-1">Typical Topics</p>
          <div className="flex flex-wrap gap-1">
            {extractionData.factual.typicalTopics.map((topic: string, i: number) => (
              <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">{topic}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  ) : null

  // Open Threads block (rendered in left column for personal, right column for professional)
  const openThreadsBlock = extractionData?.factual?.openThreads && extractionData.factual.openThreads.length > 0 ? (
    <div className="rounded-lg border bg-white p-6">
      <h3 className="text-xs font-semibold uppercase text-gray-400 mb-3">Open Threads</h3>
      <div className="space-y-2.5">
        {extractionData.factual.openThreads.map((thread: { type: string; description: string; lastMentioned?: string; initiatedBy?: string }, i: number) => {
          const borderColor =
            thread.type === 'unmade_plan' ? 'border-blue-400' :
            thread.type === 'unfollowed_promise' ? 'border-amber-400' :
            thread.type === 'open_question' ? 'border-purple-400' :
            'border-gray-300'
          const typeLabel =
            thread.type === 'unmade_plan' ? 'Unmade plan' :
            thread.type === 'unfollowed_promise' ? 'Unfollowed promise' :
            thread.type === 'open_question' ? 'Open question' :
            'Dropped topic'
          return (
            <div key={i} className={cn('border-l-2 pl-3 py-1', borderColor)}>
              <p className="text-sm text-gray-700">{thread.description}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[10px] text-gray-400">{typeLabel}</span>
                {thread.lastMentioned && (
                  <span className="text-[10px] text-gray-400">{formatDate(thread.lastMentioned)}</span>
                )}
                <span className="text-[10px] text-gray-400">
                  {thread.initiatedBy === 'stephen' ? 'You started' : 'They started'}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  ) : null

  // Scores block (rendered higher in right column for personal)
  const scoresBlock = (
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
  )

  // Comm Stats block (rendered higher in right column for personal)
  const commStatsBlock = commStats ? (
    <div className="rounded-lg border bg-white p-6">
      <h3 className="text-xs font-semibold uppercase text-gray-400 mb-3">
        Text Communication
        {commStats.droppedBall && (
          <span className="ml-2 rounded bg-red-50 px-1.5 py-0.5 text-xs text-red-600 normal-case">Dropped ball</span>
        )}
      </h3>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-xs text-gray-500">Total Messages</p>
          <p className="text-lg font-semibold text-gray-900">{commStats.totalMessages.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Avg/Week</p>
          <p className="text-lg font-semibold text-gray-900">{commStats.avgMessagesPerWeek.toFixed(1)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Last 30 Days</p>
          <p className="text-lg font-semibold text-gray-900">{commStats.last30DayCount}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Trend</p>
          <p className={cn(
            'text-lg font-semibold',
            commStats.trend === 'growing' ? 'text-green-600' :
            commStats.trend === 'fading' ? 'text-orange-500' : 'text-gray-600'
          )}>
            {commStats.trend.charAt(0).toUpperCase() + commStats.trend.slice(1)}
          </p>
        </div>
      </div>
      <div className="mt-3">
        <div className="flex justify-between text-xs text-gray-500 mb-1">
          <span>You send</span>
          <span>They send</span>
        </div>
        <div className="h-2 rounded-full bg-gray-100 overflow-hidden flex">
          <div className="h-full bg-blue-400" style={{ width: `${commStats.reciprocityRatio * 100}%` }} />
          <div className="h-full bg-green-400" style={{ width: `${(1 - commStats.reciprocityRatio) * 100}%` }} />
        </div>
        <p className="text-xs text-gray-400 mt-1 text-center">
          {commStats.messagesSent} sent / {commStats.messagesReceived} received
        </p>
      </div>
      {commStats.responseLatencyAvg && (
        <p className="text-xs text-gray-400 mt-2">
          Avg response time: {commStats.responseLatencyAvg < 60
            ? `${Math.round(commStats.responseLatencyAvg)}m`
            : `${(commStats.responseLatencyAvg / 60).toFixed(1)}h`}
        </p>
      )}
      {commStats.droppedBallSince && (
        <p className="text-xs text-red-500 mt-1">
          Unreplied since {formatDate(commStats.droppedBallSince)}
        </p>
      )}
      <div className="flex justify-between text-xs text-gray-400 mt-2 pt-2 border-t border-gray-100">
        <span>First text: {commStats.firstMessageDate ? formatDate(commStats.firstMessageDate) : '—'}</span>
        <span>Last: {commStats.lastMessageDate ? formatDate(commStats.lastMessageDate) : '—'}</span>
      </div>
    </div>
  ) : null

  // Voice Profile block
  const voiceProfileBlock = voiceData ? (
    <div className="rounded-lg border bg-white p-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold uppercase text-gray-400 flex items-center gap-1.5">
          <Mic className="w-3.5 h-3.5" />
          Voice Profile
        </h3>
        <span className={cn(
          'rounded-full px-2 py-0.5 text-[10px] font-medium',
          voiceData.tier === 'per_contact' ? 'bg-green-50 text-green-600' :
          voiceData.tier === 'archetype' ? 'bg-blue-50 text-blue-600' :
          'bg-gray-50 text-gray-500'
        )}>
          {voiceData.tier === 'per_contact' ? 'Individual' :
           voiceData.tier === 'archetype' ? voiceData.archetype?.replace(/_/g, ' ') :
           'Baseline'}
        </span>
      </div>
      {voiceData.profile.styleNotes && (
        <p className="text-sm text-gray-700 mb-3">{voiceData.profile.styleNotes}</p>
      )}
      <div className="flex flex-wrap gap-1.5 mb-3">
        <span className="rounded-full bg-purple-50 px-2.5 py-0.5 text-xs text-purple-600">
          {voiceData.profile.formality}
        </span>
        <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs text-indigo-600">
          {voiceData.profile.typicalLength.replace(/_/g, ' ')} msgs
        </span>
        <span className={cn(
          'rounded-full px-2.5 py-0.5 text-xs',
          voiceData.profile.humorLevel === 'high' ? 'bg-amber-50 text-amber-600' :
          voiceData.profile.humorLevel === 'medium' ? 'bg-amber-50 text-amber-500' :
          voiceData.profile.humorLevel === 'low' ? 'bg-gray-50 text-gray-500' :
          'bg-gray-50 text-gray-400'
        )}>
          humor: {voiceData.profile.humorLevel}
        </span>
        <span className={cn(
          'rounded-full px-2.5 py-0.5 text-xs',
          voiceData.profile.emojiUsage === 'heavy' ? 'bg-pink-50 text-pink-600' :
          voiceData.profile.emojiUsage === 'moderate' ? 'bg-pink-50 text-pink-500' :
          'bg-gray-50 text-gray-500'
        )}>
          emoji: {voiceData.profile.emojiUsage}
        </span>
      </div>
      {voiceData.profile.signaturePhrases.length > 0 && (
        <div className="mb-2">
          <p className="text-[10px] font-semibold uppercase text-gray-400 mb-1">Signature Phrases</p>
          <div className="flex flex-wrap gap-1">
            {voiceData.profile.signaturePhrases.map((phrase, i) => (
              <span key={i} className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600 italic">&ldquo;{phrase}&rdquo;</span>
            ))}
          </div>
        </div>
      )}
      {voiceData.profile.openerPatterns.length > 0 && (
        <div className="mb-2">
          <p className="text-[10px] font-semibold uppercase text-gray-400 mb-1">Openers</p>
          <div className="flex flex-wrap gap-1">
            {voiceData.profile.openerPatterns.map((p, i) => (
              <span key={i} className="rounded bg-green-50 px-2 py-0.5 text-xs text-green-700">{p}</span>
            ))}
          </div>
        </div>
      )}
      {voiceData.profile.signOffPatterns.length > 0 && (
        <div className="mb-2">
          <p className="text-[10px] font-semibold uppercase text-gray-400 mb-1">Sign-offs</p>
          <div className="flex flex-wrap gap-1">
            {voiceData.profile.signOffPatterns.map((p, i) => (
              <span key={i} className="rounded bg-orange-50 px-2 py-0.5 text-xs text-orange-700">{p}</span>
            ))}
          </div>
        </div>
      )}
      {voiceData.profile.sampleMessages.length > 0 && (
        <details className="mt-3">
          <summary className="text-[10px] font-semibold uppercase text-gray-400 cursor-pointer hover:text-gray-600">
            Sample Messages ({voiceData.profile.sampleMessages.length})
          </summary>
          <div className="mt-2 space-y-1.5">
            {voiceData.profile.sampleMessages.map((msg, i) => (
              <blockquote key={i} className="text-xs text-gray-600 border-l-2 border-gray-200 pl-2 italic">
                {msg}
              </blockquote>
            ))}
          </div>
        </details>
      )}
      <p className="text-[10px] text-gray-400 mt-2">{voiceData.tierReason}</p>
    </div>
  ) : null

  return (
    <div className="max-w-6xl mx-auto">
      {/* Back + Actions */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
        <button onClick={() => router.back()} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => { setDraftMode('write'); setDraftText(''); setDraftVoiceSource('manual'); setOriginalDraft('') }}
            className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            <MessageSquare className="h-4 w-4" />
            Write Text
          </button>
          <button
            onClick={handleAiDraft}
            disabled={draftMode === 'generating'}
            className="flex items-center gap-1.5 rounded-md bg-purple-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
          >
            {draftMode === 'generating' ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Drafting...</>
            ) : (
              <><Sparkles className="h-4 w-4" /> AI Draft</>
            )}
          </button>
          <Link href={`/interactions/new?contact=${contact.id}`} className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
            <MessageSquare className="h-4 w-4" />
            Log Interaction
          </Link>
          <Link href={`/contacts/${contact.id}/edit`} className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
            <Edit className="h-4 w-4" />
            Edit
          </Link>
          <button onClick={() => setShowMergeModal(true)} className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
            <GitMerge className="h-4 w-4" />
            Merge
          </button>
          <button onClick={() => setShowDeleteModal(true)} className="flex items-center gap-1.5 rounded-md border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50">
            <Trash2 className="h-4 w-4" />
            Delete
          </button>
        </div>
      </div>

      {/* Inline Draft Panel */}
      {draftMode !== 'closed' && (
        <div className={cn(
          'mb-4 rounded-lg border p-4',
          draftMode === 'sent' ? 'bg-green-50 border-green-200' :
          (draftMode === 'draft' || draftMode === 'editing') ? 'bg-green-50 border-green-100' :
          'bg-blue-50 border-blue-100'
        )}>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-gray-700">
              {draftMode === 'sent' ? `Sent to ${contact.name}` :
               draftMode === 'generating' ? 'Generating draft...' :
               `Draft text to ${contact.name}`}
            </h3>
            <button
              onClick={() => { setDraftMode('closed'); setDraftText(''); setOriginalDraft('') }}
              className="rounded p-1 text-gray-400 hover:text-gray-600 hover:bg-white/50"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {draftMode === 'generating' && (
            <div className="flex items-center gap-2 py-4 text-sm text-purple-600">
              <Loader2 className="h-4 w-4 animate-spin" />
              Writing in your voice...
            </div>
          )}

          {draftMode === 'sent' && (
            <div className="flex items-center gap-2 text-sm text-green-700">
              <Check className="h-4 w-4" />
              Message sent via iMessage
            </div>
          )}

          {(draftMode === 'write' || draftMode === 'editing') && (
            <>
              <textarea
                value={draftText}
                onChange={e => setDraftText(e.target.value)}
                rows={3}
                autoFocus
                placeholder={`Write a text to ${contact.name}...`}
                className="w-full rounded border border-blue-200 bg-white p-2.5 text-sm text-gray-800 focus:border-blue-400 focus:outline-none resize-y"
              />
              <div className="flex items-center gap-2 mt-2">
                <button
                  onClick={() => setDraftMode(draftText ? 'draft' : 'closed')}
                  className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                >
                  {draftMode === 'editing' ? 'Done Editing' : 'Preview'}
                </button>
                <button
                  onClick={() => { setDraftMode('closed'); setDraftText(''); setOriginalDraft('') }}
                  className="rounded border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </>
          )}

          {draftMode === 'draft' && (
            <>
              <p className="text-sm text-gray-800 whitespace-pre-wrap mb-3">{draftText}</p>
              <div className="flex items-center justify-between">
                {draftVoiceSource && draftVoiceSource !== 'manual' && (
                  <span className="text-[10px] text-green-600">
                    {draftVoiceSource === 'per_contact' ? 'personal voice' :
                     draftVoiceSource === 'fallback' ? 'fallback voice' :
                     `${draftVoiceSource} voice`}
                  </span>
                )}
                {draftVoiceSource === 'manual' && (
                  <span className="text-[10px] text-blue-500">manual draft</span>
                )}
                <div className="flex gap-1.5">
                  <button
                    onClick={() => setDraftMode('editing')}
                    className="rounded px-2.5 py-1 text-xs text-gray-500 hover:bg-white/70 transition-colors"
                  >
                    <Pencil className="h-3 w-3 inline mr-1" />
                    Edit
                  </button>
                  <button
                    onClick={handleDraftCopy}
                    className="rounded px-2.5 py-1 text-xs text-gray-500 hover:bg-green-100 transition-colors"
                  >
                    <Copy className="h-3 w-3 inline mr-1" />
                    {copySuccess ? 'Copied!' : 'Copy'}
                  </button>
                  {contact.phone && (
                    <button
                      onClick={handleDraftSend}
                      disabled={sendingDraft}
                      className="rounded bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
                    >
                      <Send className={`h-3 w-3 inline mr-1 ${sendingDraft ? 'animate-pulse' : ''}`} />
                      {sendingDraft ? 'Sending...' : 'Send iMessage'}
                    </button>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}

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
                  <select
                    value={contactType}
                    onChange={e => handleContactTypeChange(e.target.value)}
                    className={cn(
                      'rounded border px-2 py-0.5 text-xs font-medium cursor-pointer',
                      contactType === 'personal' ? 'bg-pink-50 text-pink-700 border-pink-200' :
                      contactType === 'both' ? 'bg-purple-50 text-purple-700 border-purple-200' :
                      'bg-gray-50 text-gray-600 border-gray-200'
                    )}
                  >
                    <option value="professional">Professional</option>
                    <option value="personal">Friend</option>
                    <option value="both">Both</option>
                  </select>
                </div>
                {contact.title && <p className="text-gray-600 mt-1">{contact.title}</p>}
                {contact.organization && <p className="text-gray-500">{contact.organization}</p>}
                {/* Provenance origin */}
                {provenanceAsDiscovered.length > 0 && (
                  <div className="mt-2 flex items-center gap-2 text-sm">
                    <GitPullRequest className="w-4 h-4 text-blue-500 flex-shrink-0" />
                    {provenanceAsDiscovered.map((p, i) => (
                      <span key={p.id} className="text-gray-600">
                        {i > 0 && ', '}
                        {p.type === 'routing' ? 'Routed from' : p.type === 'referral' ? 'Referred by' : 'Met via'}{' '}
                        <Link href={`/contacts/${p.sourceContactId}`} className="text-blue-600 hover:underline font-medium">
                          {p.sourceContactName}
                        </Link>
                        {p.sourceContactOrg && <span className="text-gray-400"> ({p.sourceContactOrg})</span>}
                        <span className="text-gray-400"> &mdash; {new Date(p.createdAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="text-right">
                <p className={cn('text-sm font-medium', contact.isOverdue ? 'text-red-500' : 'text-gray-500')}>
                  {contact.daysSinceInteraction !== null
                    ? `${contact.daysSinceInteraction} days`
                    : 'Never contacted'}
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

          {/* Commitments */}
          {commitments.length > 0 && (
            <div className="rounded-lg border bg-white p-6">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">
                Commitments
                {openCommitments.length > 0 && (
                  <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                    {openCommitments.length} open
                  </span>
                )}
              </h3>

              {/* Open commitments with actions */}
              {openCommitments.length > 0 && (
                <div className="space-y-3 mb-4">
                  {openCommitments.map(c => (
                    <div key={c.id} className="border-l-2 border-amber-300 pl-3 py-1">
                      <div className="flex items-start justify-between">
                        <p className="text-sm text-gray-700">{c.description}</p>
                        {c.dueDate && (
                          <span className="text-xs text-gray-400 ml-2 whitespace-nowrap">
                            Due {formatDate(c.dueDate)}
                          </span>
                        )}
                      </div>
                      <div className="mt-1.5">
                        <CommitmentActions
                          commitmentId={c.id}
                          contactName={contact.name}
                          description={c.description}
                          compact
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Fulfilled commitments */}
              {fulfilledCommitments.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-gray-400 uppercase">Fulfilled</p>
                  {fulfilledCommitments.slice(0, 5).map(c => (
                    <div key={c.id} className="flex items-center justify-between text-sm text-gray-400">
                      <span className="line-through">{c.description}</span>
                      {c.fulfilledDate && (
                        <span className="text-xs ml-2 whitespace-nowrap">{formatDate(c.fulfilledDate)}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* For personal contacts: Open Threads + Extracted Insights first, then Dossier, then Interactions, then Prep */}
          {personalData && openThreadsBlock}
          {personalData && extractedInsightsBlock}

          {/* Dossier */}
          <DossierSection contactId={contact.id} dossier={dossier} />

          {/* Meeting Prep Brief — after interactions for personal, before for professional */}
          {!personalData && <ContactPrepSection contactId={contact.id} latestPrep={latestPrep} />}

          {/* Interaction Timeline */}
          <div className="rounded-lg border bg-white p-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Interaction History</h3>
            {contact.interactions.length === 0 ? (
              <div className="text-sm text-gray-500">
                <p>No interactions logged yet</p>
                {commStats && commStats.totalMessages > 0 && (
                  <p className="mt-1 text-xs text-gray-400">
                    {commStats.totalMessages.toLocaleString()} text messages tracked
                    {commStats.lastMessageDate && ` · last ${new Date(commStats.lastMessageDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`}
                  </p>
                )}
              </div>
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
          {personalData && <ContactPrepSection contactId={contact.id} latestPrep={latestPrep} />}
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

          {/* For personal contacts: Scores + Comm Stats up high */}
          {personalData && scoresBlock}
          {personalData && commStatsBlock}
          {personalData && voiceProfileBlock}

          {/* Personal Info (for personal/both contacts) */}
          {personalData && (
            <PersonalInfoSection data={personalData} contactId={contact.id} />
          )}

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

          {/* Outreach Classification */}
          <div className="rounded-lg border bg-white p-6">
            <h3 className="text-xs font-semibold uppercase text-gray-400 mb-3">Outreach Classification</h3>
            <div className="space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={cn(
                  'rounded-full px-2.5 py-0.5 text-xs font-medium',
                  contact.outreachMode === 'direct' ? 'bg-green-50 text-green-700' :
                  contact.outreachMode === 'pathway' ? 'bg-purple-50 text-purple-700' :
                  'bg-amber-50 text-amber-700'
                )}>
                  {contact.outreachMode || 'direct'}
                </span>
                <span className={cn(
                  'rounded-full px-2.5 py-0.5 text-xs font-medium',
                  contact.accessibility === 'high' ? 'bg-green-50 text-green-700' :
                  contact.accessibility === 'medium' ? 'bg-amber-50 text-amber-700' :
                  'bg-red-50 text-red-700'
                )}>
                  {contact.accessibility || 'high'} access
                </span>
              </div>
              {contact.outreachTiming && (
                <div className="text-sm text-gray-600">
                  <span className="font-medium">Timing:</span>{' '}
                  {contact.outreachTiming === 'now_hawley' ? 'Hawley window \u2014 reach out now' :
                   contact.outreachTiming === 'wait_cftc' ? 'Wait for CFTC role' :
                   contact.outreachTiming === 'either' ? 'Either role works' :
                   'Warm intro needed'}
                </div>
              )}
              {(contact.outreachMode === 'pathway' || contact.outreachMode === 'org-entry') && contact.pathwayScore > 0 && (
                <div className="text-sm">
                  <span className="text-gray-500">Pathway Score:</span>{' '}
                  <span className={cn(
                    'font-bold',
                    contact.pathwayScore >= 60 ? 'text-green-600' :
                    contact.pathwayScore >= 40 ? 'text-amber-600' :
                    'text-gray-500'
                  )}>
                    {contact.pathwayScore.toFixed(0)}/100
                  </span>
                </div>
              )}
              {contact.pathwayNotes && (
                <p className="text-sm text-gray-600 italic">{contact.pathwayNotes}</p>
              )}
            </div>
          </div>

          {/* Active Pretexts */}
          {contact.pretexts && contact.pretexts.length > 0 && (
            <div className="rounded-lg border bg-white p-6">
              <h3 className="text-xs font-semibold uppercase text-gray-400 mb-3">Active Pretexts</h3>
              <div className="space-y-2">
                {contact.pretexts.map((p: { id: string; pretextType: string; hook: string; strength: string; validFrom: string | null; validUntil: string | null }) => (
                  <div key={p.id} className="text-sm border-l-2 border-blue-300 pl-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="rounded bg-blue-50 px-1.5 py-0.5 text-xs text-blue-600">
                        {p.pretextType.replace(/_/g, ' ')}
                      </span>
                      <span className={cn(
                        'rounded px-1.5 py-0.5 text-xs',
                        p.strength === 'strong' ? 'bg-green-50 text-green-600' :
                        p.strength === 'medium' ? 'bg-amber-50 text-amber-600' :
                        'bg-gray-50 text-gray-500'
                      )}>
                        {p.strength}
                      </span>
                      {p.validUntil && (
                        <span className="text-xs text-gray-400">expires {p.validUntil}</span>
                      )}
                      {p.validFrom && (
                        <span className="text-xs text-gray-400">from {p.validFrom}</span>
                      )}
                    </div>
                    <p className="text-gray-700 mt-1">{p.hook}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Known Contacts at Org (for org-entry) */}
          {contact.outreachMode === 'org-entry' && contact.orgContacts && contact.orgContacts.length > 0 && (
            <div className="rounded-lg border bg-white p-6">
              <h3 className="text-xs font-semibold uppercase text-gray-400 mb-3">Known at {contact.organization}</h3>
              <div className="space-y-2">
                {contact.orgContacts.map((oc: { id: string; name: string; title: string | null; status: string }) => (
                  <Link key={oc.id} href={`/contacts/${oc.id}`} className="flex items-center justify-between text-sm hover:bg-gray-50 rounded p-1 -mx-1">
                    <div>
                      <span className="font-medium text-gray-900">{oc.name}</span>
                      {oc.title && <span className="text-gray-500 ml-1">\u2014 {oc.title}</span>}
                    </div>
                    <span className={cn(
                      'rounded-full px-1.5 py-0.5 text-xs',
                      oc.status === 'active' ? 'bg-green-50 text-green-600' : 'bg-gray-50 text-gray-500'
                    )}>
                      {oc.status}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Scores (for non-personal; personal contacts render this higher up) */}
          {!personalData && scoresBlock}

          {/* Communication Stats (for non-personal; personal contacts render this higher up) */}
          {!personalData && commStatsBlock}

          {/* Extracted Insights + Open Threads (for non-personal; personal renders these in left column) */}
          {!personalData && extractedInsightsBlock}
          {!personalData && openThreadsBlock}
          {!personalData && voiceProfileBlock}

          {/* Standing Offers */}
          {standingOffers.length > 0 && (
            <div className="rounded-lg border bg-white p-6">
              <h3 className="text-xs font-semibold uppercase text-gray-400 mb-3">Standing Offers</h3>
              <div className="space-y-3">
                {standingOffers.map(offer => (
                  <div key={offer.id} className="text-sm">
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        'rounded px-1.5 py-0.5 text-xs',
                        offer.offeredBy === 'me' ? 'bg-amber-50 text-amber-600' : 'bg-blue-50 text-blue-600'
                      )}>
                        {offer.offeredBy === 'me' ? 'I offered' : 'They offered'}
                      </span>
                    </div>
                    <p className="text-gray-700 mt-1">{offer.description}</p>
                    <p className="text-xs text-gray-400 italic mt-0.5">&ldquo;{offer.originalWords}&rdquo;</p>
                  </div>
                ))}
              </div>
            </div>
          )}

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

          {/* Network Reach — contacts this person routed/referred */}
          {provenanceAsSource.length > 0 && (
            <div className="rounded-lg border bg-white p-6">
              <h3 className="text-xs font-semibold uppercase text-gray-400 mb-3 flex items-center gap-2">
                <GitPullRequest className="w-3.5 h-3.5" />
                Network Reach
              </h3>
              <div className="space-y-2">
                {provenanceAsSource.map(p => (
                  <Link key={p.id} href={`/contacts/${p.contactId}`} className="flex items-center justify-between text-sm hover:bg-gray-50 rounded p-1 -mx-1">
                    <div className="flex items-center gap-2">
                      <ArrowRight className="w-3 h-3 text-blue-400" />
                      <span className="text-gray-900">{p.contactName}</span>
                      {p.contactTitle && <span className="text-gray-400 text-xs">({p.contactTitle})</span>}
                    </div>
                    <span className={cn('text-xs', p.type === 'routing' ? 'text-green-600' : p.type === 'referral' ? 'text-blue-600' : 'text-purple-600')}>
                      {p.type}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Also at [Org] */}
          {alsoAtOrg.length > 0 && contact.organization && (
            <div className="rounded-lg border bg-white p-6">
              <h3 className="text-xs font-semibold uppercase text-gray-400 mb-3 flex items-center gap-2">
                <Building2 className="w-3.5 h-3.5" />
                Also at {contact.organization}
              </h3>
              <div className="space-y-2">
                {alsoAtOrg.map(c => (
                  <Link key={c.id} href={`/contacts/${c.id}`} className="flex items-center justify-between text-sm hover:bg-gray-50 rounded p-1 -mx-1">
                    <div className="flex items-center gap-2">
                      <span className={cn('inline-flex h-4 items-center rounded px-1 text-xs', TIER_COLORS[c.tier])}>T{c.tier}</span>
                      <span className="text-gray-900">{c.name}</span>
                    </div>
                    {c.title && <span className="text-xs text-gray-400">{c.title}</span>}
                  </Link>
                ))}
              </div>
            </div>
          )}

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

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100">
                <AlertTriangle className="h-5 w-5 text-red-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Delete Contact</h3>
            </div>
            <p className="text-sm text-gray-600 mb-2">
              Are you sure you want to delete <strong>{contact.name}</strong>?
            </p>
            <p className="text-sm text-gray-500 mb-6">
              This will permanently remove this contact and all their interactions, commitments, signals, and other related data.
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowDeleteModal(false)} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border rounded-lg hover:bg-gray-50" disabled={deleting}>Cancel</button>
              <button onClick={handleDelete} disabled={deleting} className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50">
                {deleting ? 'Deleting...' : 'Delete Contact'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Merge Modal */}
      {showMergeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100">
                  <GitMerge className="h-5 w-5 text-blue-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900">Merge Contact</h3>
              </div>
              <button onClick={() => { setShowMergeModal(false); setMergeTargetId(null); setMergeSearch(''); setMergeTargets([]) }} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Merge <strong>{contact.name}</strong> into another contact. All data will be transferred.
            </p>
            <div className="relative mb-4">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
              <input type="text" value={mergeSearch} onChange={(e) => searchMergeTargets(e.target.value)} placeholder="Search for target contact..." className="w-full pl-9 pr-4 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" autoFocus />
              {mergeTargets.length > 0 && (
                <div className="absolute z-10 mt-1 w-full bg-white border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  {mergeTargets.map(t => (
                    <button key={t.id} className="w-full text-left px-4 py-2 text-sm hover:bg-blue-50" onClick={() => { setMergeTargetId(t.id); setMergeTargetName(t.name); setMergeTargets([]); setMergeSearch(t.name) }}>
                      <span className="font-medium">{t.name}</span>
                      {t.organization && <span className="text-gray-500 ml-2">{t.organization}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {mergeTargetId && (
              <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <p className="text-sm text-amber-800">
                  <strong>{contact.name}</strong> will be merged into <strong>{mergeTargetName}</strong>. All data will be transferred.
                </p>
              </div>
            )}
            <div className="flex justify-end gap-3">
              <button onClick={() => { setShowMergeModal(false); setMergeTargetId(null); setMergeSearch(''); setMergeTargets([]) }} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border rounded-lg hover:bg-gray-50" disabled={merging}>Cancel</button>
              <button onClick={handleMerge} disabled={!mergeTargetId || merging} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {merging ? 'Merging...' : 'Merge Contacts'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

function DossierSection({
  contactId,
  dossier,
}: {
  contactId: string
  dossier: Props['dossier']
}) {
  const [expanded, setExpanded] = useState(!!dossier)
  const [content, setContent] = useState(dossier?.content || '')
  const [version, setVersion] = useState(dossier?.version || 0)
  const [updatedAt, setUpdatedAt] = useState(dossier?.createdAt || '')
  const [generating, setGenerating] = useState(false)
  const hasDossier = !!content

  async function generateDossier(mode: 'full' | 'incremental' = 'full') {
    setGenerating(true)
    try {
      const res = await fetch(`/api/contacts/${contactId}/dossier`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      })
      const data = await res.json()
      if (data.dossier) {
        setContent(data.dossier.content)
        setVersion(data.dossier.version)
        setUpdatedAt(data.dossier.createdAt)
        setExpanded(true)
      }
    } catch (error) {
      console.error('Failed to generate dossier:', error)
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="rounded-lg border bg-white">
      <div className="p-6">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <FileText className="h-4 w-4 text-blue-600" />
            Intelligence Dossier
            {version > 0 && (
              <span className="text-xs text-gray-400 font-normal">v{version}</span>
            )}
          </h3>
          <div className="flex gap-2">
            {hasDossier && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
              >
                {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                {expanded ? 'Collapse' : 'Expand'}
              </button>
            )}
            <button
              onClick={() => generateDossier('full')}
              disabled={generating}
              className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 disabled:opacity-50"
            >
              {generating ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : hasDossier ? (
                <RefreshCw className="h-3 w-3" />
              ) : (
                <FileText className="h-3 w-3" />
              )}
              {generating ? 'Synthesizing...' : hasDossier ? 'Regenerate' : 'Generate Dossier'}
            </button>
          </div>
        </div>
        {!hasDossier && !generating && (
          <p className="text-sm text-gray-400 mt-2">Generate a comprehensive intelligence dossier for this contact</p>
        )}
      </div>
      {expanded && content && (
        <div className="border-t px-6 py-4 bg-blue-50/20">
          {updatedAt && (
            <p className="text-xs text-gray-400 mb-3">
              Last updated {new Date(updatedAt).toLocaleString('en-US', {
                month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
              })}
            </p>
          )}
          <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans leading-relaxed">
            {content}
          </pre>
        </div>
      )}
    </div>
  )
}

function ContactPrepSection({
  contactId,
  latestPrep,
}: {
  contactId: string
  latestPrep: Props['latestPrep']
}) {
  const [expanded, setExpanded] = useState(!!latestPrep)
  const [briefContent, setBriefContent] = useState(latestPrep?.briefContent || '')
  const [generatedAt, setGeneratedAt] = useState(latestPrep?.generatedAt || '')
  const [generating, setGenerating] = useState(false)
  const hasBrief = !!briefContent

  async function generatePrep() {
    setGenerating(true)
    try {
      const res = await fetch('/api/meetings/prep', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactId }),
      })
      const data = await res.json()
      if (data.prep) {
        setBriefContent(data.prep.briefContent)
        setGeneratedAt(data.prep.generatedAt)
        setExpanded(true)
      }
    } catch (error) {
      console.error('Failed to generate prep:', error)
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="rounded-lg border bg-white">
      <div className="p-6">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <FileText className="h-4 w-4 text-indigo-600" />
            Meeting Prep
          </h3>
          <div className="flex gap-2">
            {hasBrief && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
              >
                {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                {expanded ? 'Collapse' : 'Expand'}
              </button>
            )}
            <button
              onClick={generatePrep}
              disabled={generating}
              className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 disabled:opacity-50"
            >
              {generating ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : hasBrief ? (
                <RefreshCw className="h-3 w-3" />
              ) : (
                <FileText className="h-3 w-3" />
              )}
              {generating ? 'Generating...' : hasBrief ? 'Regenerate' : 'Generate Prep'}
            </button>
          </div>
        </div>
        {!hasBrief && !generating && (
          <p className="text-sm text-gray-400 mt-2">Generate a prep brief before your next meeting with this contact</p>
        )}
      </div>
      {expanded && briefContent && (
        <div className="border-t px-6 py-4 bg-indigo-50/30">
          {generatedAt && (
            <p className="text-xs text-gray-400 mb-2">
              Generated {new Date(generatedAt).toLocaleString('en-US', {
                month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
              })}
            </p>
          )}
          <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans leading-relaxed">
            {briefContent}
          </pre>
        </div>
      )}
    </div>
  )
}


// ── Ring/Funnel color helpers ──
const RING_STYLES: Record<string, string> = {
  close: 'bg-pink-50 text-pink-700 border-pink-200',
  regular: 'bg-blue-50 text-blue-700 border-blue-200',
  outer: 'bg-gray-100 text-gray-600 border-gray-200',
  new: 'bg-green-50 text-green-700 border-green-200',
}

const FUNNEL_LABELS: Record<string, string> = {
  new_acquaintance: 'New Acquaintance',
  party_contact: 'Party Contact',
  happy_hour: 'Happy Hour Regular',
  dinner: 'Dinner Guest',
  close_friend: 'Close Friend',
}

const EVENT_TYPE_LABELS: Record<string, string> = {
  birthday: 'Birthday', anniversary: 'Anniversary', child_birth: 'Child Birth',
  move: 'Move', job_change: 'Job Change', graduation: 'Graduation',
  engagement: 'Engagement', wedding: 'Wedding', health: 'Health',
  loss: 'Loss', milestone: 'Milestone', custom: 'Custom',
}

const RELATIONSHIP_TYPE_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  know_each_other: { bg: 'bg-gray-100', text: 'text-gray-600', label: 'know each other' },
  introduced_by_stephen: { bg: 'bg-blue-50', text: 'text-blue-600', label: 'I introduced' },
  couples_friends: { bg: 'bg-pink-50', text: 'text-pink-600', label: 'couples friends' },
  partners: { bg: 'bg-purple-50', text: 'text-purple-600', label: 'partners' },
}

function WhoTheyKnowSection({ contactId, initialRelationships }: {
  contactId: string
  initialRelationships: Array<{ id: string; contactId: string; contactName: string; type: string }>
}) {
  const [relationships, setRelationships] = useState(initialRelationships)
  const [showSearch, setShowSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Array<{ id: string; name: string; organization: string | null }>>([])
  const [searching, setSearching] = useState(false)
  const [selectedContact, setSelectedContact] = useState<{ id: string; name: string } | null>(null)
  const [selectedType, setSelectedType] = useState('know_each_other')
  const [adding, setAdding] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  // Debounced search
  const searchContacts = async (q: string) => {
    if (q.length < 2) { setSearchResults([]); return }
    setSearching(true)
    try {
      const res = await fetch(`/api/contacts?search=${encodeURIComponent(q)}&limit=8`)
      const data = await res.json()
      // Filter out current contact and already-linked contacts
      const existingIds = new Set([contactId, ...relationships.map(r => r.contactId)])
      setSearchResults((data.contacts || []).filter((c: { id: string }) => !existingIds.has(c.id)))
    } catch { setSearchResults([]) }
    setSearching(false)
  }

  // Search with debounce effect
  const searchTimeoutRef = useState<NodeJS.Timeout | null>(null)

  const handleSearchChange = (value: string) => {
    setSearchQuery(value)
    setSelectedContact(null)
    if (searchTimeoutRef[0]) clearTimeout(searchTimeoutRef[0])
    searchTimeoutRef[0] = setTimeout(() => searchContacts(value), 300)
  }

  const handleAdd = async () => {
    if (!selectedContact) return
    setAdding(true)
    try {
      const res = await fetch('/api/social/relationships', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contactAId: contactId,
          contactBId: selectedContact.id,
          relationshipType: selectedType,
        }),
      })
      if (res.ok) {
        const created = await res.json()
        setRelationships(prev => [...prev, {
          id: created.id,
          contactId: selectedContact.id,
          contactName: selectedContact.name,
          type: selectedType,
        }])
        setShowSearch(false)
        setSearchQuery('')
        setSelectedContact(null)
        setSelectedType('know_each_other')
        setSearchResults([])
      }
    } catch { /* ignore */ }
    setAdding(false)
  }

  const handleDelete = async (relationshipId: string) => {
    setDeleting(relationshipId)
    try {
      const res = await fetch(`/api/social/relationships?id=${relationshipId}`, { method: 'DELETE' })
      if (res.ok) {
        setRelationships(prev => prev.filter(r => r.id !== relationshipId))
      }
    } catch { /* ignore */ }
    setDeleting(null)
  }

  return (
    <div className="rounded-lg border bg-white p-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold uppercase text-gray-400">Who They Know</h3>
        {!showSearch && (
          <button
            onClick={() => setShowSearch(true)}
            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
          >
            <Plus className="h-3 w-3" />
            Add Connection
          </button>
        )}
      </div>

      {/* Add connection form */}
      {showSearch && (
        <div className="mb-3 rounded-lg border border-blue-200 bg-blue-50/50 p-3 space-y-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <input
              type="text"
              placeholder="Search contacts..."
              value={searchQuery}
              onChange={e => handleSearchChange(e.target.value)}
              className="w-full rounded border border-gray-200 bg-white py-1.5 pl-7 pr-8 text-sm focus:border-blue-400 focus:outline-none"
              autoFocus
            />
            <button
              onClick={() => { setShowSearch(false); setSearchQuery(''); setSelectedContact(null); setSearchResults([]) }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Search results dropdown */}
          {searchQuery.length >= 2 && !selectedContact && (
            <div className="rounded border border-gray-200 bg-white max-h-40 overflow-y-auto">
              {searching ? (
                <div className="flex items-center justify-center py-3 text-xs text-gray-400">
                  <Loader2 className="h-3 w-3 animate-spin mr-1" /> Searching...
                </div>
              ) : searchResults.length === 0 ? (
                <div className="py-3 text-center text-xs text-gray-400">No contacts found</div>
              ) : (
                searchResults.map(c => (
                  <button
                    key={c.id}
                    onClick={() => { setSelectedContact({ id: c.id, name: c.name }); setSearchResults([]) }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center justify-between"
                  >
                    <span className="font-medium text-gray-900">{c.name}</span>
                    {c.organization && <span className="text-xs text-gray-400">{c.organization}</span>}
                  </button>
                ))
              )}
            </div>
          )}

          {/* Selected contact + type picker */}
          {selectedContact && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-900">{selectedContact.name}</span>
                <button onClick={() => { setSelectedContact(null); setSearchQuery('') }} className="text-gray-400 hover:text-gray-600">
                  <X className="h-3 w-3" />
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(RELATIONSHIP_TYPE_STYLES).map(([type, style]) => (
                  <button
                    key={type}
                    onClick={() => setSelectedType(type)}
                    className={cn(
                      'rounded-full px-2.5 py-1 text-xs font-medium transition-all',
                      selectedType === type
                        ? `${style.bg} ${style.text} ring-2 ring-offset-1 ring-current`
                        : 'bg-gray-50 text-gray-400 hover:bg-gray-100'
                    )}
                  >
                    {style.label}
                  </button>
                ))}
              </div>
              <button
                onClick={handleAdd}
                disabled={adding}
                className="w-full rounded bg-blue-600 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {adding ? 'Adding...' : 'Add Connection'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Existing relationships */}
      {relationships.length === 0 ? (
        <p className="text-sm text-gray-400 italic">No connections tracked yet</p>
      ) : (
        <div className="space-y-1">
          {relationships.map(fr => {
            const style = RELATIONSHIP_TYPE_STYLES[fr.type] || RELATIONSHIP_TYPE_STYLES.know_each_other
            return (
              <div key={fr.id} className="group flex items-center justify-between text-sm hover:bg-gray-50 rounded p-1.5 -mx-1.5">
                <Link href={`/contacts/${fr.contactId}`} className="flex items-center gap-2 min-w-0 flex-1">
                  <span className="font-medium text-gray-900 truncate">{fr.contactName}</span>
                  <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium', style.bg, style.text)}>
                    {style.label}
                  </span>
                </Link>
                <button
                  onClick={() => handleDelete(fr.id)}
                  disabled={deleting === fr.id}
                  className="ml-2 shrink-0 opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-all"
                >
                  {deleting === fr.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function PersonalInfoSection({ data, contactId }: {
  data: NonNullable<Props['personalData']>
  contactId: string
}) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState({
    personalRing: data.personalRing || '',
    funnelStage: data.funnelStage || '',
    howWeMet: data.howWeMet || '',
    streetAddress: data.streetAddress || '',
    city: data.city || '',
    neighborhood: data.neighborhood || '',
    stateRegion: data.stateRegion || '',
    zipCode: data.zipCode || '',
    communicationPref: data.communicationPref || '',
    partnerName: data.partnerName || '',
    dietaryNotes: data.dietaryNotes || '',
    availabilityNotes: data.availabilityNotes || '',
    emotionalContext: data.emotionalContext || '',
    reciprocityPattern: data.reciprocityPattern || 'unknown',
  })
  const [newInterest, setNewInterest] = useState('')
  const [newActivity, setNewActivity] = useState('')
  const [showLifeEventForm, setShowLifeEventForm] = useState(false)
  const router = useRouter()

  async function savePersonalInfo() {
    setSaving(true)
    try {
      await fetch(`/api/contacts/${contactId}/personal`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })
      setEditing(false)
      router.refresh()
    } catch (err) { alert('Error: ' + err) }
    setSaving(false)
  }

  async function addInterest() {
    if (!newInterest.trim()) return
    await fetch('/api/personal/interests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contactId, interest: newInterest.trim(), confidence: 'medium', source: 'manual' }),
    })
    setNewInterest('')
    router.refresh()
  }

  async function removeInterest(id: string) {
    await fetch(`/api/personal/interests?id=${id}`, { method: 'DELETE' })
    router.refresh()
  }

  async function addActivity() {
    if (!newActivity.trim()) return
    await fetch('/api/personal/activities', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contactId, activity: newActivity.trim(), confidence: 'medium', source: 'manual', frequency: 'occasional' }),
    })
    setNewActivity('')
    router.refresh()
  }

  async function removeActivity(id: string) {
    await fetch(`/api/personal/activities?id=${id}`, { method: 'DELETE' })
    router.refresh()
  }

  async function addLifeEvent(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    await fetch(`/api/contacts/${contactId}/life-events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventType: form.get('eventType') || 'custom',
        description: form.get('description'),
        eventDate: form.get('eventDate') || null,
        recurring: form.get('recurring') === 'on',
      }),
    })
    setShowLifeEventForm(false)
    router.refresh()
  }

  async function removeLifeEvent(id: string) {
    await fetch(`/api/contacts/${contactId}/life-events?id=${id}`, { method: 'DELETE' })
    router.refresh()
  }

  return (
    <>
      {/* Personal Info Card */}
      <div className="rounded-lg border bg-white p-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold uppercase text-gray-400 flex items-center gap-1.5">
            <Heart className="h-3.5 w-3.5" /> Personal Info
          </h3>
          <button onClick={() => setEditing(!editing)} className="text-xs text-blue-600 hover:text-blue-700">
            {editing ? 'Cancel' : 'Edit'}
          </button>
        </div>

        {!editing ? (
          <div className="space-y-2.5">
            <div className="flex items-center gap-2 flex-wrap">
              {data.personalRing && (
                <span className={cn('rounded border px-2 py-0.5 text-xs font-medium', RING_STYLES[data.personalRing] || RING_STYLES.new)}>
                  {data.personalRing}
                </span>
              )}
              {data.funnelStage && (
                <span className="rounded bg-purple-50 border border-purple-200 px-2 py-0.5 text-xs text-purple-700">
                  {FUNNEL_LABELS[data.funnelStage] || data.funnelStage}
                </span>
              )}
              {data.personalCadenceDays && (
                <span className="text-xs text-gray-400">{data.personalCadenceDays}d cadence</span>
              )}
            </div>
            {data.howWeMet && <p className="text-sm text-gray-600"><span className="text-gray-400 text-xs">Met:</span> {data.howWeMet}</p>}
            {(data.streetAddress || data.city || data.stateRegion) && (
              <div className="text-sm text-gray-600">
                <div className="flex items-start gap-1.5">
                  <Home className="h-3.5 w-3.5 mt-0.5 text-gray-400 shrink-0" />
                  <div>
                    {data.streetAddress && <div>{data.streetAddress}</div>}
                    <div>
                      {[data.city, data.stateRegion].filter(Boolean).join(', ')}
                      {data.zipCode && ` ${data.zipCode}`}
                    </div>
                    {data.neighborhood && <div className="text-xs text-gray-400">{data.neighborhood}</div>}
                  </div>
                </div>
              </div>
            )}
            {data.communicationPref && <p className="text-xs text-gray-500">Prefers: {data.communicationPref}</p>}
            {data.partnerName && <p className="text-xs text-gray-500">Partner: {data.partnerName}</p>}
            {data.dietaryNotes && <p className="text-xs text-gray-500">Dietary: {data.dietaryNotes}</p>}
            {data.availabilityNotes && <p className="text-xs text-gray-500">Availability: {data.availabilityNotes}</p>}
            {data.emotionalContext && (
              <div className="rounded bg-amber-50 border border-amber-200 px-2 py-1">
                <p className="text-xs text-amber-700">{data.emotionalContext}</p>
                {data.emotionalContextSet && <p className="text-[10px] text-amber-500 mt-0.5">Set {data.emotionalContextSet}</p>}
              </div>
            )}
            {data.reciprocityPattern && data.reciprocityPattern !== 'unknown' && (
              <p className="text-xs text-gray-500">Reciprocity: {data.reciprocityPattern.replace(/_/g, ' ')}</p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-gray-400 uppercase">Ring</label>
                <select value={formData.personalRing} onChange={e => setFormData({...formData, personalRing: e.target.value})}
                  className="w-full rounded border border-gray-200 px-2 py-1 text-sm">
                  <option value="">None</option>
                  <option value="close">Close</option>
                  <option value="regular">Regular</option>
                  <option value="outer">Outer</option>
                  <option value="new">New</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] text-gray-400 uppercase">Funnel</label>
                <select value={formData.funnelStage} onChange={e => setFormData({...formData, funnelStage: e.target.value})}
                  className="w-full rounded border border-gray-200 px-2 py-1 text-sm">
                  <option value="">None</option>
                  {Object.entries(FUNNEL_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="text-[10px] text-gray-400 uppercase">How We Met</label>
              <input value={formData.howWeMet} onChange={e => setFormData({...formData, howWeMet: e.target.value})}
                className="w-full rounded border border-gray-200 px-2 py-1 text-sm" />
            </div>
            <div>
              <label className="text-[10px] text-gray-400 uppercase">Street Address</label>
              <input value={formData.streetAddress} onChange={e => setFormData({...formData, streetAddress: e.target.value})}
                className="w-full rounded border border-gray-200 px-2 py-1 text-sm" />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <div>
                <label className="text-[10px] text-gray-400 uppercase">City</label>
                <input value={formData.city} onChange={e => setFormData({...formData, city: e.target.value})}
                  className="w-full rounded border border-gray-200 px-2 py-1 text-sm" />
              </div>
              <div>
                <label className="text-[10px] text-gray-400 uppercase">State</label>
                <input value={formData.stateRegion} onChange={e => setFormData({...formData, stateRegion: e.target.value})}
                  className="w-full rounded border border-gray-200 px-2 py-1 text-sm" />
              </div>
              <div>
                <label className="text-[10px] text-gray-400 uppercase">Zip</label>
                <input value={formData.zipCode} onChange={e => setFormData({...formData, zipCode: e.target.value})}
                  className="w-full rounded border border-gray-200 px-2 py-1 text-sm" />
              </div>
            </div>
            <div>
              <label className="text-[10px] text-gray-400 uppercase">Neighborhood</label>
              <input value={formData.neighborhood} onChange={e => setFormData({...formData, neighborhood: e.target.value})}
                className="w-full rounded border border-gray-200 px-2 py-1 text-sm" placeholder="Dupont, Georgetown..." />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-gray-400 uppercase">Communication</label>
                <select value={formData.communicationPref} onChange={e => setFormData({...formData, communicationPref: e.target.value})}
                  className="w-full rounded border border-gray-200 px-2 py-1 text-sm">
                  <option value="">Not set</option>
                  <option value="texter">Texter</option>
                  <option value="caller">Caller</option>
                  <option value="in_person">In Person</option>
                  <option value="all">All</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] text-gray-400 uppercase">Reciprocity</label>
                <select value={formData.reciprocityPattern} onChange={e => setFormData({...formData, reciprocityPattern: e.target.value})}
                  className="w-full rounded border border-gray-200 px-2 py-1 text-sm">
                  <option value="unknown">Unknown</option>
                  <option value="i_initiate">I Initiate</option>
                  <option value="they_initiate">They Initiate</option>
                  <option value="mutual">Mutual</option>
                </select>
              </div>
            </div>
            <div>
              <label className="text-[10px] text-gray-400 uppercase">Partner Name</label>
              <input value={formData.partnerName} onChange={e => setFormData({...formData, partnerName: e.target.value})}
                className="w-full rounded border border-gray-200 px-2 py-1 text-sm" />
            </div>
            <div>
              <label className="text-[10px] text-gray-400 uppercase">Dietary Notes</label>
              <input value={formData.dietaryNotes} onChange={e => setFormData({...formData, dietaryNotes: e.target.value})}
                className="w-full rounded border border-gray-200 px-2 py-1 text-sm" />
            </div>
            <div>
              <label className="text-[10px] text-gray-400 uppercase">Availability Notes</label>
              <input value={formData.availabilityNotes} onChange={e => setFormData({...formData, availabilityNotes: e.target.value})}
                className="w-full rounded border border-gray-200 px-2 py-1 text-sm" />
            </div>
            <div>
              <label className="text-[10px] text-gray-400 uppercase">Emotional Context</label>
              <input value={formData.emotionalContext} onChange={e => setFormData({...formData, emotionalContext: e.target.value})}
                className="w-full rounded border border-gray-200 px-2 py-1 text-sm" placeholder="Going through a tough time..." />
            </div>
            <button onClick={savePersonalInfo} disabled={saving}
              className="w-full rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        )}
      </div>

      {/* Interests & Activities */}
      <div className="rounded-lg border bg-white p-6">
        <h3 className="text-xs font-semibold uppercase text-gray-400 mb-3 flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5" /> Interests & Activities
        </h3>
        {data.interests.length > 0 && (
          <div className="mb-3">
            <p className="text-[10px] text-gray-400 uppercase mb-1">Interests</p>
            <div className="flex flex-wrap gap-1">
              {data.interests.map(i => (
                <span key={i.id} className="group inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-xs text-violet-700">
                  {i.interest}
                  <button onClick={() => removeInterest(i.id)} className="hidden group-hover:inline text-violet-400 hover:text-red-500">&times;</button>
                </span>
              ))}
            </div>
          </div>
        )}
        <div className="flex gap-1 mb-3">
          <input value={newInterest} onChange={e => setNewInterest(e.target.value)} placeholder="Add interest..."
            className="flex-1 rounded border border-gray-200 px-2 py-1 text-xs"
            onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addInterest())} />
          <button onClick={addInterest} className="rounded bg-violet-100 px-2 py-1 text-xs text-violet-700 hover:bg-violet-200">
            <Plus className="h-3 w-3" />
          </button>
        </div>
        {data.activities.length > 0 && (
          <div className="mb-3">
            <p className="text-[10px] text-gray-400 uppercase mb-1">Activities</p>
            <div className="flex flex-wrap gap-1">
              {data.activities.map(a => (
                <span key={a.id} className="group inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">
                  {a.activity}
                  <button onClick={() => removeActivity(a.id)} className="hidden group-hover:inline text-emerald-400 hover:text-red-500">&times;</button>
                </span>
              ))}
            </div>
          </div>
        )}
        <div className="flex gap-1">
          <input value={newActivity} onChange={e => setNewActivity(e.target.value)} placeholder="Add activity..."
            className="flex-1 rounded border border-gray-200 px-2 py-1 text-xs"
            onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addActivity())} />
          <button onClick={addActivity} className="rounded bg-emerald-100 px-2 py-1 text-xs text-emerald-700 hover:bg-emerald-200">
            <Plus className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Groups */}
      {data.groups.length > 0 && (
        <div className="rounded-lg border bg-white p-6">
          <h3 className="text-xs font-semibold uppercase text-gray-400 mb-3 flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" /> Groups
          </h3>
          <div className="flex flex-wrap gap-1">
            {data.groups.map(g => (
              <Link key={g.id} href="/social/groups"
                className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700 hover:bg-blue-100">
                {g.name}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Life Events */}
      <div className="rounded-lg border bg-white p-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold uppercase text-gray-400 flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5" /> Life Events
          </h3>
          <button onClick={() => setShowLifeEventForm(!showLifeEventForm)} className="text-xs text-blue-600 hover:text-blue-700">
            {showLifeEventForm ? 'Cancel' : '+ Add'}
          </button>
        </div>
        {showLifeEventForm && (
          <form onSubmit={addLifeEvent} className="mb-3 space-y-2 rounded bg-gray-50 p-3">
            <div className="grid grid-cols-2 gap-2">
              <select name="eventType" className="rounded border border-gray-200 px-2 py-1 text-xs">
                {Object.entries(EVENT_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <input name="eventDate" type="date" className="rounded border border-gray-200 px-2 py-1 text-xs" />
            </div>
            <input name="description" required placeholder="Description..." className="w-full rounded border border-gray-200 px-2 py-1 text-xs" />
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-1.5 text-xs text-gray-500">
                <input name="recurring" type="checkbox" className="rounded" /> Recurring (yearly)
              </label>
              <button type="submit" className="rounded bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700">Add</button>
            </div>
          </form>
        )}
        {data.lifeEvents.length > 0 ? (
          <div className="space-y-2">
            {data.lifeEvents.map(le => (
              <div key={le.id} className="group flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">
                    {EVENT_TYPE_LABELS[le.eventType] || le.eventType}
                  </span>
                  <span className="text-gray-700">{le.description}</span>
                  {le.recurring && <span className="text-[10px] text-gray-400">↻</span>}
                </div>
                <div className="flex items-center gap-2">
                  {le.eventDate && <span className="text-xs text-gray-400">{le.eventDate}</span>}
                  <button onClick={() => removeLifeEvent(le.id)} className="hidden group-hover:inline text-xs text-red-400 hover:text-red-600">&times;</button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-gray-400">No life events recorded</p>
        )}
      </div>

      {/* Social Events */}
      {data.socialEvents.length > 0 && (
        <div className="rounded-lg border bg-white p-6">
          <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-semibold uppercase text-gray-400 mb-3">Recent Social Events</h3>
                  <InviteToEventButton contactId={contactId} />
                </div>
          <div className="space-y-2">
            {data.socialEvents.map(se => (
              <Link key={se.id} href="/social/plans" className="flex items-center justify-between text-sm hover:bg-gray-50 rounded p-1 -mx-1">
                <div className="flex items-center gap-2">
                  <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">{se.eventType}</span>
                  <span className="text-gray-700">{se.title || 'Untitled'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={cn('rounded px-1.5 py-0.5 text-[10px]',
                    se.status === 'attended' ? 'bg-green-50 text-green-600' :
                    se.status === 'confirmed' ? 'bg-blue-50 text-blue-600' :
                    'bg-gray-50 text-gray-500'
                  )}>{se.status}</span>
                  <span className="text-xs text-gray-400">{se.date}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Who They Know */}
      <WhoTheyKnowSection contactId={contactId} initialRelationships={data.friendRelationships} />
    </>
  )
}