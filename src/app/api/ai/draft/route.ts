import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { shouldGenerateOutreach, getCurrentRole, getBestPretext } from '@/lib/outreach/pretext-selector'
import { budgetedCreate, truncateForAPI } from '@/lib/api-budget'
export async function POST(request: NextRequest) {
  const body = await request.json()
  const { contactId, triggerType, triggerDescription, signalContext, format } = body

  if (!contactId) {
    return NextResponse.json({ error: 'contactId is required' }, { status: 400 })
  }

  // Fetch contact with recent interactions and signals
  const contact = await prisma.contact.findUnique({
    where: { id: contactId },
    include: {
      interactions: { orderBy: { date: 'desc' }, take: 5 },
      signals: { orderBy: { detectedAt: 'desc' }, take: 5 },
      outreachItems: { where: { status: 'sent' }, orderBy: { sentAt: 'desc' }, take: 3 },
    },
  })

  if (!contact) {
    return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
  }

  // --- Pathway Intelligence: Outreach Gating ---
  const gating = await shouldGenerateOutreach(
    {
      id: contact.id,
      outreachMode: (contact as Record<string, unknown>).outreachMode as string || 'direct',
      accessibility: (contact as Record<string, unknown>).accessibility as string || 'high',
      outreachTiming: (contact as Record<string, unknown>).outreachTiming as string | null,
      organization: contact.organization,
    },
    prisma
  )

  if (!gating.proceed) {
    return NextResponse.json({
      gated: true,
      reason: gating.reason,
      redirectContactId: gating.redirectContactId || null,
      redirectContactName: gating.redirectContactName || null,
    }, { status: 422 })
  }

  // Load pretext and role context for draft
  const roleTransition = await getCurrentRole(prisma)
  const bestPretext = gating.pretext || await getBestPretext(contactId, prisma)

  // Fetch style guide and expertise profile
  const settings = await prisma.appSetting.findMany({
    where: { key: { in: ['style_guide', 'expertise_profile'] } },
  })
  const styleGuide = settings.find(s => s.key === 'style_guide')?.value || '{}'
  const expertiseProfile = settings.find(s => s.key === 'expertise_profile')?.value || '{}'

  let parsedStyle: Record<string, unknown> = {}
  let parsedExpertise: Record<string, unknown> = {}
  try { parsedStyle = JSON.parse(styleGuide) } catch { /* ignore */ }
  try { parsedExpertise = JSON.parse(expertiseProfile) } catch { /* ignore */ }

  // Build context package
  const contextPackage = {
    contact: {
      name: contact.name,
      title: contact.title,
      organization: contact.organization,
      tier: contact.tier,
      whyTheyMatter: contact.whyTheyMatter,
      connectionToHawleyOrbit: contact.connectionToHawleyOrbit,
      notes: contact.notes,
      categories: contact.categories,
      tags: contact.tags,
    },
    recentInteractions: contact.interactions.map(i => ({
      type: i.type,
      date: i.date,
      summary: i.summary,
    })),
    recentSignals: contact.signals.map(s => ({
      type: s.signalType,
      title: s.title,
      description: s.description,
      date: s.detectedAt,
      outreachHook: s.outreachHook,
    })),
    previousOutreach: contact.outreachItems.map(o => ({
      subject: o.draftSubject,
      sentAt: o.sentAt,
    })),
    trigger: {
      type: triggerType || 'manual',
      description: triggerDescription || '',
      signalContext: signalContext || null,
    },
    pretext: bestPretext ? {
      type: bestPretext.pretextType,
      hook: bestPretext.hook,
      strength: bestPretext.strength,
    } : null,
    roleContext: roleTransition ? {
      currentRole: roleTransition.current_role,
      roleLabel: roleTransition.current_role_label,
    } : null,
  }

  const draftFormat = format || 'email'

  const systemPrompt = `You are a professional outreach drafting assistant for Stephen Andrews, a senior government attorney at the CFTC who specializes in commodity regulation, crypto regulatory policy, and administrative law reform.

STYLE GUIDE:
- Tone: ${parsedStyle.tone || 'Professional but warm. Direct. No fluff.'}
- Structure: ${parsedStyle.structure || 'Short emails: 3-5 sentences. Lead with the hook. Close with a specific ask.'}
- Never say: ${Array.isArray(parsedStyle.never_say) ? parsedStyle.never_say.join(', ') : 'Generic openers like "I hope this finds you well"'}
- Do say: ${Array.isArray(parsedStyle.do_say) ? parsedStyle.do_say.join(', ') : 'Reference specific shared interests or recent work'}

EXPERTISE PROFILE:
${parsedExpertise.bio_short || 'Government attorney focused on commodity and crypto regulation.'}
Primary areas: ${Array.isArray(parsedExpertise.primary) ? parsedExpertise.primary.join(', ') : 'Administrative law, commodity regulation'}

FORMAT: ${draftFormat}
${draftFormat === 'email' ? 'Write a professional email with Subject line and Body. Keep it 3-5 sentences.' : ''}
${draftFormat === 'linkedin' ? 'Write a LinkedIn message. Keep it 2-3 sentences, conversational.' : ''}
${draftFormat === 'text' ? 'Write a brief text message. 1-2 sentences max.' : ''}

Return your response in this exact format:
SUBJECT: [subject line]
---
[body text]`

  const userPrompt = `Draft a ${draftFormat} to this contact:

CONTACT:
- Name: ${contact.name}
- Title: ${contact.title || 'Unknown'}
- Organization: ${contact.organization || 'Unknown'}
- Tier: ${contact.tier} (${contact.tier === 1 ? 'highest priority' : contact.tier === 2 ? 'medium priority' : 'lower priority'})
- Why they matter: ${contact.whyTheyMatter || 'N/A'}
- Connection context: ${contact.connectionToHawleyOrbit || 'N/A'}
- Notes: ${contact.notes || 'None'}

TRIGGER FOR OUTREACH:
- Type: ${triggerType || 'manual'}
- Context: ${triggerDescription || 'General networking touch'}
${signalContext ? `- Signal: ${signalContext}` : ''}
${bestPretext ? `
PRETEXT/HOOK FOR THIS OUTREACH:
- Type: ${bestPretext.pretextType}
- Hook: ${bestPretext.hook}
- Strength: ${bestPretext.strength}
Use this hook as the basis for the outreach. It provides the reason and framing for reaching out.` : ''}
${roleTransition ? `
YOUR CURRENT ROLE: ${roleTransition.current_role_label}` : ''}

RECENT INTERACTIONS:
${contact.interactions.length > 0
    ? contact.interactions.map(i => `- ${i.date}: ${i.type} — ${i.summary || 'No summary'}`).join('\n')
    : '- No previous interactions recorded'}

RECENT INTELLIGENCE SIGNALS:
${contact.signals.length > 0
    ? contact.signals.map(s => `- ${s.detectedAt}: ${s.signalType} — ${s.title}${s.outreachHook ? ` (Hook: ${s.outreachHook})` : ''}`).join('\n')
    : '- No recent signals'}

PREVIOUS OUTREACH:
${contact.outreachItems.length > 0
    ? contact.outreachItems.map(o => `- ${o.sentAt}: ${o.draftSubject}`).join('\n')
    : '- No previous outreach sent'}

Draft the ${draftFormat} now.`

  try {
    const message = await budgetedCreate({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }, 'ai-draft')

    const responseText = message.content
      .filter(block => block.type === 'text')
      .map(block => (block as { type: 'text'; text: string }).text)
      .join('')

    // Parse subject and body from response
    let subject = ''
    let draftBody = responseText

    const subjectMatch = responseText.match(/^SUBJECT:\s*([^\n]+)\n(?:---\n)?/)
    if (subjectMatch) {
      subject = subjectMatch[1].trim()
      draftBody = responseText.slice(subjectMatch[0].length).trim()
    }

    return NextResponse.json({
      subject,
      body: draftBody,
      gatingNote: gating.reason || null,
      contextPackage: JSON.stringify(contextPackage),
      model: 'claude-sonnet-4-20250514',
      format: draftFormat,
    })
  } catch (error) {
    console.error('AI draft generation failed:', error)
    return NextResponse.json(
      { error: 'Failed to generate draft. Check ANTHROPIC_API_KEY.' },
      { status: 500 }
    )
  }
}
