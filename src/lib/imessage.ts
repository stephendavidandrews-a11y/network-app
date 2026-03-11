/**
 * iMessage sending via AppleScript on macOS.
 *
 * Uses the Messages.app AppleScript interface to send texts.
 * Confirmed working on this Mac Mini with iMessage service ID:
 * FA36D00D-476B-4AE9-B711-2342A27E4A3F
 */

import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

/**
 * Escape a string for use in AppleScript.
 * Handles quotes, backslashes, and special characters.
 */
function escapeForAppleScript(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
}

/**
 * Send a single iMessage to a phone number.
 */
export async function sendIMessage(
  phoneNumber: string,
  message: string,
): Promise<{ success: boolean; error?: string }> {
  if (!phoneNumber || phoneNumber.trim() === '') {
    return { success: false, error: 'No phone number provided' }
  }

  const escapedMessage = escapeForAppleScript(message)
  const phone = phoneNumber.trim()

  const script = `
    tell application "Messages"
      set targetService to 1st account whose service type = iMessage
      set targetBuddy to participant "${phone}" of targetService
      send "${escapedMessage}" to targetBuddy
    end tell
  `

  try {
    await execFileAsync('osascript', ['-e', script], { timeout: 15000 })
    return { success: true }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    console.error(`[iMessage] Failed to send to ${phone}:`, error)
    return { success: false, error }
  }
}

/**
 * Send batch iMessages for a social plan.
 * Loads the plan, gets contacts with draft texts, and sends each one.
 */
export async function sendBatchIMessages(planId: string): Promise<{
  sent: number
  failed: Array<{ contactId: string; name: string; error: string }>
}> {
  const { prisma } = await import('./db')

  const plan = await prisma.socialPlan.findUnique({ where: { id: planId } })
  if (!plan) throw new Error('Plan not found')

  const contacts = JSON.parse(plan.suggestedContacts || '[]') as Array<{
    contactId: string
    name: string
    phone: string | null
    draftText?: string
    sentAt?: string
  }>

  let sent = 0
  const failed: Array<{ contactId: string; name: string; error: string }> = []

  for (const c of contacts) {
    // Skip if already sent or no draft
    if (c.sentAt || !c.draftText) continue

    // Look up phone number if not in plan data
    let phone = c.phone
    if (!phone || phone.trim() === '') {
      const contact = await prisma.contact.findUnique({
        where: { id: c.contactId },
        select: { phone: true },
      })
      phone = contact?.phone || null
    }

    if (!phone || phone.trim() === '') {
      failed.push({ contactId: c.contactId, name: c.name, error: 'No phone number' })
      continue
    }

    const result = await sendIMessage(phone, c.draftText)
    if (result.success) {
      c.sentAt = new Date().toISOString()
      sent++
    } else {
      failed.push({ contactId: c.contactId, name: c.name, error: result.error || 'Unknown error' })
    }

    // Small delay between sends to avoid overwhelming Messages.app
    await new Promise(resolve => setTimeout(resolve, 1000))
  }

  // Update plan with sent timestamps
  await prisma.socialPlan.update({
    where: { id: planId },
    data: {
      suggestedContacts: JSON.stringify(contacts),
      status: sent > 0 && failed.length === 0 ? 'completed' : plan.status,
    },
  })

  return { sent, failed }
}
