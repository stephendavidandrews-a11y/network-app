export interface ContactRecord {
  id: string
  name: string
  title: string | null
  organization: string | null
  email: string | null
  phone: string | null
  linkedinUrl: string | null
  twitterHandle: string | null
  personalWebsite: string | null
  photoUrl: string | null
  tier: number
  categories: string[]
  tags: string[]
  targetCadenceDays: number
  lastInteractionDate: string | null
  relationshipStrength: number
  strategicValue: number
  introductionPathway: string | null
  connectionToHawleyOrbit: string | null
  whyTheyMatter: string | null
  status: ContactStatus
  notes: string | null
  createdAt: string
  updatedAt: string
  // Computed
  daysSinceInteraction?: number | null
  isOverdue?: boolean
}

export type ContactStatus = 'target' | 'outreach_sent' | 'active' | 'warm' | 'cold' | 'dormant'

export type InteractionType =
  | 'email_sent' | 'email_received' | 'meeting' | 'call' | 'coffee'
  | 'conference_encounter' | 'event_copanel' | 'introduction_made'
  | 'introduction_received' | 'text_message' | 'linkedin_message' | 'other'

export interface InteractionRecord {
  id: string
  contactId: string
  type: InteractionType
  date: string
  summary: string | null
  commitments: Commitment[]
  newContactsMentioned: MentionedContact[]
  followUpRequired: boolean
  followUpDescription: string | null
  followUpCompleted: boolean
  followUpCompletedDate: string | null
  source: 'manual' | 'voice_debrief' | 'email_parsed' | 'system'
  createdAt: string
  contact?: ContactRecord
}

export interface Commitment {
  description: string
  due_date: string | null
  fulfilled: boolean
  fulfilled_date: string | null
}

export interface MentionedContact {
  name: string
  organization: string | null
  context: string
}

export type SignalType =
  | 'publication' | 'speech' | 'job_change' | 'media_quote' | 'comment_letter'
  | 'conference_appearance' | 'social_media_post' | 'podcast_appearance'
  | 'award' | 'regulatory_filing' | 'other'

export interface SignalRecord {
  id: string
  contactId: string
  signalType: SignalType
  title: string
  description: string | null
  sourceUrl: string | null
  sourceName: string | null
  detectedAt: string
  outreachHook: string | null
  hookUsed: boolean
  relevanceScore: number
  createdAt: string
  contact?: ContactRecord
}

export interface EventRecord {
  id: string
  name: string
  organizer: string | null
  location: string | null
  dateStart: string | null
  dateEnd: string | null
  eventUrl: string | null
  eventType: string | null
  topicRelevanceScore: number
  topics: string[]
  hasSpeakingOpportunity: boolean
  cfpDeadline: string | null
  cfpUrl: string | null
  cfpStatus: string
  abstractDraft: string | null
  contactsAttending: string[]
  contactsSpeaking: string[]
  preEventOutreachSent: boolean
  postEventFollowupSent: boolean
  attending: boolean
  speaking: boolean
  notes: string | null
  createdAt: string
  updatedAt: string
}

export type OutreachTriggerType =
  | 'cadence_overdue' | 'intelligence_signal' | 'event_proximity'
  | 'strategic_recommendation' | 'commitment_followup' | 'introduction_request'
  | 'batch_regulatory_event' | 'manual'

export type OutreachStatus =
  | 'queued' | 'drafted' | 'review' | 'approved' | 'sent' | 'deferred' | 'skipped'

export interface OutreachRecord {
  id: string
  contactId: string
  triggerType: OutreachTriggerType
  triggerDescription: string
  signalId: string | null
  eventId: string | null
  priority: number
  draftSubject: string | null
  draftBody: string | null
  draftFormat: 'email' | 'text' | 'linkedin' | 'signal'
  aiModelUsed: string | null
  contextPackage: string | null
  status: OutreachStatus
  originalDraft: string | null
  finalText: string | null
  wasEdited: boolean
  createdAt: string
  reviewedAt: string | null
  sentAt: string | null
  deferredUntil: string | null
  notes: string | null
  contact?: ContactRecord
}

export interface RelationshipRecord {
  id: string
  contactAId: string
  contactBId: string
  relationshipType: string | null
  strength: number
  source: string
  notes: string | null
  createdAt: string
}

export interface DashboardData {
  overdueCount: number
  openCommitments: number
  outreachReady: number
  recentSignals: SignalRecord[]
  overdueContacts: ContactRecord[]
  upcomingEvents: EventRecord[]
}
