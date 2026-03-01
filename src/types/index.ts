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

// ── Calendar Types ──

export interface CalendarMeeting {
  id: string
  summary: string
  start: string
  end: string
  location: string | null
  attendees: Array<{
    email: string
    displayName: string | null
    responseStatus: string
  }>
  matchedContactId: string | null
  matchedContactName: string | null
  matchedContactTier: number | null
  linkedEventId: string | null
  linkedEventName: string | null
}

export interface CalendarDayData {
  date: string
  meetings: CalendarMeeting[]
  meetingCount: number
  fetchedAt: string
}

export type CalendarLoad = 'light' | 'normal' | 'heavy'

// ── Meeting Prep Types ──

export interface MeetingPrepRecord {
  id: string
  date: string
  contactId: string
  calendarEventId: string | null
  meetingTitle: string | null
  briefContent: string
  generatedAt: string
}

// ── Commitment Types ──

export type CommitmentUrgency = 'overdue' | 'today' | 'this_week' | 'upcoming'

export interface CommitmentRecord {
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
  // Enriched fields (computed at query time)
  contactName?: string
  contactOrg?: string | null
  interactionDate?: string
  daysOverdue?: number | null
  urgency?: CommitmentUrgency
}

// ── Enrichment Types ──

export type EnrichmentStatus = 'pending' | 'found' | 'not_found' | 'error' | 'approved' | 'rejected'

export interface OrganizationDomainRecord {
  id: string
  organization: string
  domain: string | null
  resolvedBy: 'claude' | 'manual' | 'hunter'
  confidence: 'high' | 'medium' | 'low'
  notes: string | null
  createdAt: string
}

export interface EnrichmentResultRecord {
  id: string
  contactId: string
  source: 'hunter' | 'manual' | 'ingestion'
  email: string | null
  score: number | null
  domain: string | null
  rawResponse: string | null
  status: EnrichmentStatus
  reviewedAt: string | null
  createdAt: string
  contact?: {
    id: string
    name: string
    organization: string | null
    email: string | null
    tier: number
    strategicValue: number
  }
}

export interface EnrichmentPipelineStats {
  totalContacts: number
  haveEmail: number
  missingEmail: number
  missingOrg: number
  pendingDomainResolution: number
  pendingEmailLookup: number
  pendingReview: number
  approved: number
  rejected: number
}

// ── Ingestion System Types ──

export type IngestionSource = 'email' | 'imessage_auto' | 'ios_shortcut' | 'voice' | 'signal_forward' | 'manual'

export type IngestionItemType = 'interaction' | 'intelligence_signal' | 'scheduling' | 'irrelevant'

export type IngestionStatus = 'pending' | 'confirmed' | 'edited' | 'dismissed' | 'auto_handled'

export type IngestionSentiment = 'warm' | 'neutral' | 'transactional' | 'tense' | 'enthusiastic'

export type RelationshipDelta = 'strengthened' | 'maintained' | 'weakened' | 'new'

// Full extraction output from Claude — produced for every ingested item
export interface IngestionExtraction {
  // Classification
  itemType: IngestionItemType

  // Core
  summary: string
  topicsDiscussed: string[]

  // Commitments (hard, with deadlines)
  myCommitments: IngestionCommitment[]
  theirCommitments: IngestionCommitment[]

  // Asks & Offers (soft, no firm deadlines)
  asks: SoftAsk[]
  offers: StandingOfferExtraction[]

  // People
  newContactsMentioned: NewContactExtraction[]
  existingContactsMentioned: string[]
  observedConnections: ObservedConnection[]

  // Scheduling
  calendarEvents: CalendarEventExtraction[]
  schedulingLeads: SchedulingLeadExtraction[]

  // Intelligence
  orgIntelligence: OrgIntelExtraction[]
  referencedResources: ResourceExtraction[]

  // Life Events
  lifeEvents: LifeEventExtraction[]

  // Relationship
  relationshipNotes: string
  sentiment: IngestionSentiment
  relationshipDelta: RelationshipDelta

  // Status Changes
  statusChanges: StatusChangeExtraction[]
}

export interface IngestionCommitment {
  description: string
  originalWords: string
  resolvedDate: string | null
  confidence: 'high' | 'medium' | 'low'
}

export interface SoftAsk {
  description: string
  direction: 'from_me' | 'from_them'
  originalWords: string
}

export interface StandingOfferExtraction {
  description: string
  offeredBy: 'me' | 'them'
  originalWords: string
}

export interface NewContactExtraction {
  name: string
  org: string | null
  title: string | null
  email: string | null
  phone: string | null
  context: string
  connectionTo: string | null
}

export interface ObservedConnection {
  person1: string
  person2: string
  nature: string
  strength: 'strong' | 'moderate' | 'weak' | 'unknown'
  source: string
  directional: boolean
}

export interface CalendarEventExtraction {
  title: string
  originalWords: string
  date: string | null
  startTime: string | null
  endTime: string | null
  location: string | null
  attendees: string[]
}

export interface SchedulingLeadExtraction {
  description: string
  originalWords: string
  timeframe: string | null
}

export interface OrgIntelExtraction {
  organization: string
  intelligence: string
  source: string
}

export interface ResourceExtraction {
  description: string
  type: 'paper' | 'article' | 'podcast' | 'document' | 'book' | 'other'
  url: string | null
  action: 'they_will_send' | 'i_should_read' | 'i_will_send' | 'reference_only'
}

export interface LifeEventExtraction {
  description: string
  person: string
  date: string | null
  recurring: boolean
}

export interface StatusChangeExtraction {
  person: string
  changeType: 'job_change' | 'promotion' | 'departure' | 'org_change' | 'other'
  from: string | null
  to: string | null
  description: string
}

// Database record types for ingestion models

export interface IngestionItemRecord {
  id: string
  source: IngestionSource
  itemType: IngestionItemType
  rawContent: string
  transcript: string | null
  contactId: string | null
  contactHint: string | null
  extraction: IngestionExtraction
  manifest: ConfirmManifest | null
  status: IngestionStatus
  sensitivityFlag: boolean
  contentHash: string | null
  threadId: string | null
  clusterId: string | null
  dismissReason: string | null
  confidence: number | null
  autoHandled: boolean
  createdAt: string
  reviewedAt: string | null
  // Enriched
  contactName?: string
  contactOrg?: string | null
  contactTier?: number
}

// Manifest of everything a confirmed ingestion item created (for atomic undo)
export interface ConfirmManifest {
  interactionId?: string
  commitmentIds?: string[]
  signalIds?: string[]
  standingOfferIds?: string[]
  schedulingLeadIds?: string[]
  contactIds?: string[]       // new contacts created
  relationshipIds?: string[]  // observed connections
  dossierVersion?: number
  calendarEventIds?: string[] // Google Calendar events created
}

export interface StandingOfferRecord {
  id: string
  contactId: string
  description: string
  offeredBy: 'me' | 'them'
  originalWords: string
  sourceInteractionId: string | null
  sourceIngestionId: string | null
  active: boolean
  createdAt: string
  usedAt: string | null
  // Enriched
  contactName?: string
  contactOrg?: string | null
}

export interface SchedulingLeadRecord {
  id: string
  contactId: string
  description: string
  originalWords: string | null
  timeframe: string | null
  resolvedDate: string | null
  status: 'open' | 'scheduled' | 'stale' | 'auto_resolved'
  linkedEventId: string | null
  sourceIngestionId: string | null
  createdAt: string
  // Enriched
  contactName?: string
  contactOrg?: string | null
}

export interface ContactDossierRecord {
  id: string
  contactId: string
  version: number
  content: string
  updatedBy: 'incremental' | 'full_resynthesis'
  sourceInteractionId: string | null
  createdAt: string
}

export interface LearningSignalRecord {
  id: string
  ingestionItemId: string
  action: 'confirmed' | 'dismissed' | 'edited' | 'auto_override'
  editDetails: string | null
  dismissReason: string | null
  teachMeResponse: string | null
  createdAt: string
}

// Ingestion API request body
export interface IngestRequest {
  source: IngestionSource
  contactHint?: string
  content?: string
  audioBase64?: string
  metadata?: {
    originalFrom?: string
    originalTo?: string
    subject?: string
    forwardedFrom?: string
    threadId?: string
    groupParticipants?: number
    signature?: {
      name?: string
      title?: string
      org?: string
      phone?: string
      email?: string
      linkedin?: string
    }
  }
}

// Inbox stats for dashboard
export interface InboxStats {
  pending: number
  confirmed: number
  dismissed: number
  autoHandled: number
  todayPending: number
}

// ── Voice Debrief Types ──

export interface DebriefCommitment {
  description: string
  originalWords: string
  resolvedDate: string | null
  resolvedTime: string | null  // HH:MM 24h format
  confidence: 'high' | 'medium' | 'low'
  dueDate: string | null  // backward-compat alias for resolvedDate
}

export interface DebriefCalendarEvent {
  title: string
  originalWords: string
  date: string | null       // YYYY-MM-DD
  startTime: string | null  // HH:MM 24h
  endTime: string | null    // HH:MM 24h
  location: string | null
  attendees: string[]       // names mentioned
  addedToCalendar?: boolean // client-side tracking
}

export interface DebriefExtraction {
  summary: string
  myCommitments: DebriefCommitment[]
  contactCommitments: DebriefCommitment[]
  calendarEvents: DebriefCalendarEvent[]
  newContactsMentioned: Array<{ name: string; org: string | null; context: string }>
  followUps: Array<{ description: string; originalWords: string }>
  relationshipNotes: string
  topicsDiscussed: string[]
  // Legacy compat — populated from myCommitments for downstream consumers
  commitments: Array<{ description: string; dueDate: string | null }>
}
