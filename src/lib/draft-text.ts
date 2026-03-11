/**
 * Voice-powered text message drafting.
 *
 * Generates personalized text messages that match Stephen's texting voice
 * using the hierarchical voice profile system:
 *   1. Per-contact voice profile (50 profiles for top contacts)
 *   2. Archetype profile by ring (friend_close, friend_regular, new_acquaintance)
 *   3. Global fallback profile
 */

import { prisma } from './db'
import { budgetedCreate, truncateForAPI } from '@/lib/api-budget'
export interface DraftTextRequest {
  contactId: string
  planType: string  // happy_hour, golf, dinner, party, reachout, birthday, followup
  targetDate?: string
  venueName?: string
  hooks: string[]
  otherInvitees?: string[]
  customContext?: string
}

export interface DraftTextResult {
  draftText: string
  voiceSource: string  // 'per_contact' | 'archetype_close' | 'archetype_regular' | 'archetype_new' | 'fallback'
}

interface VoiceProfile {
  formality: string
  typicalLength: string
  humorLevel: string
  emojiUsage: string
  signaturePhrases: string[]
  openerPatterns: string[]
  signOffPatterns: string[]
  styleNotes: string
  sampleMessages: string[]
}

/**
 * Load voice profile for a contact using the 3-tier hierarchy.
 */
async function loadVoiceProfile(
  contactId: string,
  ring: string,
): Promise<{ profile: VoiceProfile; source: string }> {
  // Tier 1: Per-contact profile
  const perContact = await prisma.textVoiceProfile.findFirst({
    where: { scope: 'per_contact', contactId },
  })
  if (perContact) {
    return {
      profile: parseVoiceProfile(perContact),
      source: 'per_contact',
    }
  }

  // Tier 2: Archetype by ring
  const archetypeMap: Record<string, string> = {
    close: 'friend_close',
    regular: 'friend_regular',
    outer: 'new_acquaintance',
    new: 'new_acquaintance',
  }
  const archetype = archetypeMap[ring] || 'friend_regular'
  const archetypeProfile = await prisma.textVoiceProfile.findFirst({
    where: { scope: 'archetype', archetype },
  })
  if (archetypeProfile) {
    return {
      profile: parseVoiceProfile(archetypeProfile),
      source: `archetype_${ring}`,
    }
  }

  // Tier 3: Global fallback
  const fallback = await prisma.textVoiceProfile.findFirst({
    where: { scope: 'fallback' },
  })
  if (fallback) {
    return {
      profile: parseVoiceProfile(fallback),
      source: 'fallback',
    }
  }

  // Absolute fallback — no voice profiles at all
  return {
    profile: {
      formality: 'casual',
      typicalLength: 'short',
      humorLevel: 'medium',
      emojiUsage: 'rare',
      signaturePhrases: [],
      openerPatterns: [],
      signOffPatterns: [],
      styleNotes: 'Casual, direct texting style.',
      sampleMessages: [],
    },
    source: 'none',
  }
}

function parseVoiceProfile(row: {
  formality: string
  typicalLength: string
  humorLevel: string
  emojiUsage: string
  signaturePhrases: string
  openerPatterns: string
  signOffPatterns: string
  styleNotes: string | null
  sampleMessages: string
}): VoiceProfile {
  return {
    formality: row.formality,
    typicalLength: row.typicalLength,
    humorLevel: row.humorLevel,
    emojiUsage: row.emojiUsage,
    signaturePhrases: JSON.parse(row.signaturePhrases || '[]'),
    openerPatterns: JSON.parse(row.openerPatterns || '[]'),
    signOffPatterns: JSON.parse(row.signOffPatterns || '[]'),
    styleNotes: row.styleNotes || '',
    sampleMessages: JSON.parse(row.sampleMessages || '[]'),
  }
}

const PURPOSE_TEMPLATES: Record<string, string> = {
  happy_hour: 'Invite them to a happy hour/drinks',
  golf: 'Invite them to play golf',
  dinner: 'Invite them to dinner',
  party: 'Invite them to a party/gathering',
  reachout: 'Casual reach-out text just to stay in touch',
  birthday: 'Happy birthday text',
  followup: 'Follow-up text after a previous conversation or event',
}

/**
 * Load recent draft corrections as few-shot examples.
 * Tries contact-specific corrections first, then falls back to general ones.
 */
async function loadDraftCorrections(
  contactId: string,
  purpose: string,
): Promise<Array<{ original: string; edited: string }>> {
  // First: corrections for this specific contact (most relevant)
  const contactCorrections = await prisma.draftCorrection.findMany({
    where: { contactId },
    orderBy: { createdAt: 'desc' },
    take: 3,
    select: { originalDraft: true, editedDraft: true },
  })

  // Then: corrections for same purpose type (broader patterns)
  const purposeCorrections = await prisma.draftCorrection.findMany({
    where: {
      purpose,
      NOT: { contactId },
    },
    orderBy: { createdAt: 'desc' },
    take: 3,
    select: { originalDraft: true, editedDraft: true },
  })

  // Combine: contact-specific first, then general, max 5
  const all = [
    ...contactCorrections.map(c => ({ original: c.originalDraft, edited: c.editedDraft })),
    ...purposeCorrections.map(c => ({ original: c.originalDraft, edited: c.editedDraft })),
  ]
  return all.slice(0, 5)
}

/**
 * Save a draft correction when Stephen edits a generated draft.
 */
export async function saveDraftCorrection(params: {
  contactId?: string
  purpose: string
  originalDraft: string
  editedDraft: string
  voiceSource: string
}): Promise<void> {
  // Only save if the edit is meaningfully different (not just whitespace)
  const origNorm = params.originalDraft.trim().toLowerCase()
  const editNorm = params.editedDraft.trim().toLowerCase()
  if (origNorm === editNorm) return

  await prisma.draftCorrection.create({
    data: {
      contactId: params.contactId || null,
      purpose: params.purpose,
      originalDraft: params.originalDraft,
      editedDraft: params.editedDraft,
      voiceSource: params.voiceSource,
    },
  })
}

/**
 * Generate a single draft text message using the contact's voice profile.
 */
export async function generateDraftText(req: DraftTextRequest): Promise<DraftTextResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { draftText: '[API key not configured]', voiceSource: 'none' }
  }

  // Get contact info
  const contact = await prisma.contact.findUnique({
    where: { id: req.contactId },
    select: { name: true, personalRing: true },
  })
  if (!contact) {
    return { draftText: '[Contact not found]', voiceSource: 'none' }
  }

  const ring = contact.personalRing || 'new'
  const { profile, source } = await loadVoiceProfile(req.contactId, ring)

  const purpose = PURPOSE_TEMPLATES[req.planType] || 'Send a casual text'

  // Load past corrections as learning examples
  const corrections = await loadDraftCorrections(req.contactId, req.planType)

  // Build system prompt
  let systemPrompt = `You are ghostwriting a text message from Stephen to ${contact.name}.

VOICE PROFILE:
- Formality: ${profile.formality}
- Typical Length: ${profile.typicalLength}
- Humor Level: ${profile.humorLevel}
- Emoji Usage: ${profile.emojiUsage}
- Style Notes: ${profile.styleNotes}
${profile.signaturePhrases.length > 0 ? `- Signature Phrases: ${profile.signaturePhrases.join(', ')}` : ''}
${profile.openerPatterns.length > 0 ? `- Opener Patterns: ${profile.openerPatterns.join(', ')}` : ''}
${profile.signOffPatterns.length > 0 ? `- Sign-off Patterns: ${profile.signOffPatterns.join(', ')}` : ''}
${profile.sampleMessages.length > 0 ? `\nSAMPLE MESSAGES (match this style):\n${profile.sampleMessages.slice(0, 5).map(m => `"${m}"`).join('\n')}` : ''}`

  // Add correction examples if available
  if (corrections.length > 0) {
    systemPrompt += `\n\nSTYLE CORRECTIONS (Stephen edited these AI drafts — learn from his changes):`
    for (const c of corrections) {
      systemPrompt += `\nAI wrote: "${c.original}"\nStephen changed to: "${c.edited}"`
    }
    systemPrompt += `\nApply these patterns: notice what Stephen changes (tone, length, phrasing, formality) and match his preferred style.`
  }

  systemPrompt += `

CRITICAL RULES:
- Match the voice profile EXACTLY. Sound like Stephen, not an AI.
- ${profile.typicalLength === 'very_short' ? 'Keep it to 1-2 sentences max.' : profile.typicalLength === 'short' ? 'Keep it to 2-3 sentences.' : profile.typicalLength === 'medium' ? 'Keep it to 3-5 sentences.' : 'Can be longer but stay natural.'}
- ${profile.emojiUsage === 'none' || profile.emojiUsage === 'rare' ? 'Do NOT use emojis unless the profile says otherwise.' : 'Use emojis sparingly and naturally.'}
- Be natural and conversational. No corporate speak, no "I hope this message finds you well."
- IMPORTANT: If a specific day of the week is provided (e.g. "Tuesday"), you MUST use that EXACT day. Never substitute a different day name.
- IMPORTANT: When other invitees are listed, they have been INVITED but have NOT yet confirmed. Never say they "are in", "confirmed", "are coming", or "are down". Instead say they're "invited", or phrase it as "I'm seeing if X and Y are down too" or "thinking about getting a group together with X and Y".
- Output ONLY the text message. No quotes, no explanation, no preamble.`

  // Build user prompt
  let userPrompt = `Purpose: ${purpose}\nRecipient: ${contact.name} (${ring} friend)`

  if (req.targetDate) {
    const d = new Date(req.targetDate + 'T00:00:00')
    const dayOfWeek = d.toLocaleDateString('en-US', { weekday: 'long' })
    const formatted = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
    userPrompt += `\nDate: ${formatted} (this is a ${dayOfWeek} — you MUST say "${dayOfWeek}" if mentioning the day, NOT any other day)`
  }
  if (req.venueName) {
    userPrompt += `\nVenue: ${req.venueName}`
  }
  if (req.hooks.length > 0) {
    userPrompt += `\nConversation hooks to weave in naturally (pick 1-2 at most): ${req.hooks.join(', ')}`
  }
  if (req.otherInvitees && req.otherInvitees.length > 0) {
    userPrompt += `\nOther people invited (NOT yet confirmed): ${req.otherInvitees.join(', ')}`
  }
  if (req.customContext) {
    userPrompt += `\nAdditional context: ${req.customContext}`
  }

  userPrompt += '\n\nWrite the text message now.'

  try {
    const message = await budgetedCreate({
      model: 'claude-opus-4-20250514',
      max_tokens: 300,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }, 'draft-text')

    const draftText = message.content
      .filter(block => block.type === 'text')
      .map(block => (block as { type: 'text'; text: string }).text)
      .join('')
      .trim()

    return { draftText, voiceSource: source }
  } catch (err) {
    console.error('[DraftText] Anthropic error:', err)
    return { draftText: '[Draft generation failed]', voiceSource: source }
  }
}

/**
 * Generate draft texts for all contacts in a plan.
 */
export async function generateBatchDraftTexts(planId: string): Promise<void> {
  const plan = await prisma.socialPlan.findUnique({
    where: { id: planId },
    include: { venue: { select: { name: true } } },
  })
  if (!plan) throw new Error('Plan not found')

  const contacts = JSON.parse(plan.suggestedContacts || '[]') as Array<{
    contactId: string
    name: string
    phone: string | null
    ring: string
    hooks: string[]
    draftText?: string
    voiceSource?: string
  }>

  const otherNames = contacts.map(c => c.name)

  for (const c of contacts) {
    const others = otherNames.filter(n => n !== c.name)
    const result = await generateDraftText({
      contactId: c.contactId,
      planType: plan.planType,
      targetDate: plan.targetDate,
      venueName: plan.venue?.name || undefined,
      hooks: c.hooks || [],
      otherInvitees: others,
    })

    c.draftText = result.draftText
    c.voiceSource = result.voiceSource
  }

  await prisma.socialPlan.update({
    where: { id: planId },
    data: { suggestedContacts: JSON.stringify(contacts) },
  })
}
