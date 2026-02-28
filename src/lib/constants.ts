export const TIER_CADENCE: Record<number, number> = {
  1: 30,
  2: 60,
  3: 90,
}

export const TIER_LABELS: Record<number, string> = {
  1: 'Strategic Priority',
  2: 'Important',
  3: 'Awareness',
}

export const TIER_COLORS: Record<number, string> = {
  1: 'text-amber-500 bg-amber-500/10 border-amber-500/30',
  2: 'text-blue-500 bg-blue-500/10 border-blue-500/30',
  3: 'text-gray-400 bg-gray-400/10 border-gray-400/30',
}

export const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-500',
  outreach_sent: 'bg-blue-500',
  warm: 'bg-amber-500',
  cold: 'bg-gray-400',
  dormant: 'bg-gray-400',
  target: 'bg-violet-500',
}

export const STATUS_LABELS: Record<string, string> = {
  target: 'Target',
  outreach_sent: 'Outreach Sent',
  active: 'Active',
  warm: 'Warm',
  cold: 'Cold',
  dormant: 'Dormant',
}

export const INTERACTION_TYPES = [
  { value: 'email_sent', label: 'Email Sent' },
  { value: 'email_received', label: 'Email Received' },
  { value: 'meeting', label: 'Meeting' },
  { value: 'call', label: 'Call' },
  { value: 'coffee', label: 'Coffee' },
  { value: 'conference_encounter', label: 'Conference Encounter' },
  { value: 'event_copanel', label: 'Event Co-panel' },
  { value: 'introduction_made', label: 'Introduction Made' },
  { value: 'introduction_received', label: 'Introduction Received' },
  { value: 'text_message', label: 'Text Message' },
  { value: 'linkedin_message', label: 'LinkedIn Message' },
  { value: 'other', label: 'Other' },
] as const

export const SIGNAL_TYPES = [
  { value: 'publication', label: 'Publication' },
  { value: 'speech', label: 'Speech' },
  { value: 'job_change', label: 'Job Change' },
  { value: 'media_quote', label: 'Media Quote' },
  { value: 'comment_letter', label: 'Comment Letter' },
  { value: 'conference_appearance', label: 'Conference Appearance' },
  { value: 'social_media_post', label: 'Social Media Post' },
  { value: 'podcast_appearance', label: 'Podcast Appearance' },
  { value: 'award', label: 'Award' },
  { value: 'regulatory_filing', label: 'Regulatory Filing' },
  { value: 'other', label: 'Other' },
] as const

export const EVENT_TYPES = [
  { value: 'conference', label: 'Conference' },
  { value: 'panel', label: 'Panel' },
  { value: 'roundtable', label: 'Roundtable' },
  { value: 'CLE', label: 'CLE' },
  { value: 'reception', label: 'Reception' },
  { value: 'podcast', label: 'Podcast' },
  { value: 'webinar', label: 'Webinar' },
  { value: 'seminar', label: 'Seminar' },
  { value: 'workshop', label: 'Workshop' },
  { value: 'other', label: 'Other' },
] as const

export const CATEGORIES = [
  'Crypto VC',
  'Crypto Exchanges',
  'Crypto Legal',
  'Crypto Policy',
  'DeFi',
  'Prediction Markets',
  'Traditional Finance',
  'Banking',
  'Commodities',
  'Think Tanks & Policy',
  'Administrative Law',
  'Former CFTC',
  'Current CFTC',
  'SEC & Other Regulators',
  'Congressional Staff',
  'Congressional Members',
  'DOJ & Enforcement',
  'White House & Executive',
  'Media & Journalists',
  'Academia',
  'Law Firms',
  'Industry Associations',
] as const
