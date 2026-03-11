/**
 * API Budget Enforcement
 *
 * Centralized wrapper around Anthropic API calls that:
 * 1. Tracks every API call's token usage and estimated cost
 * 2. Enforces a hard daily spending cap (default $10/day)
 * 3. Refuses to make calls once the budget is exhausted
 * 4. Logs all usage to SQLite for auditing
 *
 * ALL Anthropic API calls in the app MUST go through budgetedCreate().
 * Direct calls to anthropic.messages.create() are forbidden.
 */

import Anthropic from '@anthropic-ai/sdk'
import type { MessageCreateParams } from '@anthropic-ai/sdk/resources/messages'
import { prisma } from '@/lib/db'

// ── Configuration ──────────────────────────────────────────────────────
const DAILY_BUDGET_USD = parseFloat(process.env.API_DAILY_BUDGET_USD || '10.00')
const MAX_INPUT_CHARS = 400_000 // ~100K tokens — hard ceiling to prevent runaway prompts

// Pricing per million tokens (as of 2025-05)
const PRICING: Record<string, { input: number; output: number }> = {
  'claude-sonnet-4-20250514': { input: 3.0, output: 15.0 },
  'claude-opus-4-20250514':   { input: 15.0, output: 75.0 },
  'claude-haiku-4-5-20251001': { input: 1.0, output: 5.0 },
}
const DEFAULT_PRICING = { input: 3.0, output: 15.0 }

// ── Singleton client ───────────────────────────────────────────────────
let _client: Anthropic | null = null
function getClient(): Anthropic {
  if (!_client) {
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || '' })
  }
  return _client
}

// ── Table initialization ───────────────────────────────────────────────
let _tableReady = false
async function ensureTable(): Promise<void> {
  if (_tableReady) return
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS api_budget_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL DEFAULT (datetime('now')),
      date TEXT NOT NULL,
      caller TEXT NOT NULL,
      model TEXT NOT NULL,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      estimated_cost_usd REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'success',
      error_message TEXT
    )
  `)
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_api_budget_log_date ON api_budget_log(date)
  `)
  _tableReady = true
}

// ── Budget checking ────────────────────────────────────────────────────
export async function getDailySpend(date?: string): Promise<number> {
  await ensureTable()
  const d = date || new Date().toISOString().split('T')[0]
  const result = await prisma.$queryRawUnsafe<Array<{ total: number | null }>>(
    `SELECT SUM(estimated_cost_usd) as total FROM api_budget_log WHERE date = ? AND status = 'success'`,
    d
  )
  return Number(result[0]?.total ?? 0)
}

export async function getDailyBudget(): Promise<number> {
  return DAILY_BUDGET_USD
}

export async function getDailyCallCount(date?: string): Promise<number> {
  await ensureTable()
  const d = date || new Date().toISOString().split('T')[0]
  const result = await prisma.$queryRawUnsafe<Array<{ cnt: number }>>(
    `SELECT COUNT(*) as cnt FROM api_budget_log WHERE date = ?`,
    d
  )
  return Number(result[0]?.cnt ?? 0)
}

// ── Error class ────────────────────────────────────────────────────────
export class BudgetExceededError extends Error {
  public dailySpend: number
  public dailyBudget: number

  constructor(spent: number, budget: number) {
    super(
      `API daily budget exceeded: $${spent.toFixed(2)} spent of $${budget.toFixed(2)} limit. ` +
      `No more API calls will be made today. Set API_DAILY_BUDGET_USD env var to adjust.`
    )
    this.name = 'BudgetExceededError'
    this.dailySpend = spent
    this.dailyBudget = budget
  }
}

export class ContentTooLargeError extends Error {
  public charCount: number
  public maxChars: number

  constructor(charCount: number, maxChars: number) {
    super(
      `Content too large for API call: ${charCount.toLocaleString()} chars exceeds ` +
      `${maxChars.toLocaleString()} char limit (~${Math.round(maxChars / 4).toLocaleString()} tokens). ` +
      `Content must be truncated before calling the API.`
    )
    this.name = 'ContentTooLargeError'
    this.charCount = charCount
    this.maxChars = maxChars
  }
}

// ── Cost estimation ────────────────────────────────────────────────────
function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const prices = PRICING[model] || DEFAULT_PRICING
  return (inputTokens * prices.input + outputTokens * prices.output) / 1_000_000
}

function estimateInputChars(params: MessageCreateParams): number {
  let chars = 0

  // System prompt
  if (typeof params.system === 'string') {
    chars += params.system.length
  } else if (Array.isArray(params.system)) {
    for (const block of params.system) {
      if ('text' in block) chars += block.text.length
    }
  }

  // Messages
  for (const msg of params.messages) {
    if (typeof msg.content === 'string') {
      chars += msg.content.length
    } else if (Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if ('text' in block) chars += (block as { text: string }).text.length
      }
    }
  }

  return chars
}

// ── Core: Budget-enforced API call ─────────────────────────────────────
/**
 * Make a Claude API call with budget enforcement.
 *
 * @param params - Standard Anthropic MessageCreateParams
 * @param caller - Identifier for logging (e.g., 'email-poll', 'content-extract')
 * @throws BudgetExceededError if daily budget is exhausted
 * @throws ContentTooLargeError if input exceeds MAX_INPUT_CHARS
 */
export async function budgetedCreate(
  params: MessageCreateParams,
  caller: string = 'unknown'
): Promise<Anthropic.Message> {
  await ensureTable()

  const today = new Date().toISOString().split('T')[0]
  const model = params.model || 'claude-sonnet-4-20250514'

  // ── Guard 1: Check content size ──────────────────────────────────
  const inputChars = estimateInputChars(params)
  if (inputChars > MAX_INPUT_CHARS) {
    // Log the rejection
    await prisma.$executeRawUnsafe(
      `INSERT INTO api_budget_log (date, caller, model, input_tokens, output_tokens, estimated_cost_usd, status, error_message)
       VALUES (?, ?, ?, ?, 0, 0, 'rejected_size', ?)`,
      today,
      caller,
      model,
      Math.round(inputChars / 4),
      `Content too large: ${inputChars} chars`
    )
    throw new ContentTooLargeError(inputChars, MAX_INPUT_CHARS)
  }

  // ── Guard 2: Check daily budget ──────────────────────────────────
  const currentSpend = await getDailySpend(today)
  if (currentSpend >= DAILY_BUDGET_USD) {
    // Log the rejection
    await prisma.$executeRawUnsafe(
      `INSERT INTO api_budget_log (date, caller, model, input_tokens, output_tokens, estimated_cost_usd, status, error_message)
       VALUES (?, ?, ?, 0, 0, 0, 'rejected_budget', ?)`,
      today,
      caller,
      model,
      `Budget exceeded: $${currentSpend.toFixed(2)} of $${DAILY_BUDGET_USD.toFixed(2)}`
    )
    throw new BudgetExceededError(currentSpend, DAILY_BUDGET_USD)
  }

  // ── Guard 3: Pre-flight cost estimate ────────────────────────────
  const estimatedInputTokens = Math.round(inputChars / 4)
  const estimatedMaxTokens = params.max_tokens || 4096
  const worstCaseCost = estimateCost(model, estimatedInputTokens, estimatedMaxTokens)

  if (currentSpend + worstCaseCost > DAILY_BUDGET_USD * 1.5) {
    // If worst case would exceed 150% of budget, reject preemptively
    await prisma.$executeRawUnsafe(
      `INSERT INTO api_budget_log (date, caller, model, input_tokens, output_tokens, estimated_cost_usd, status, error_message)
       VALUES (?, ?, ?, ?, 0, 0, 'rejected_estimate', ?)`,
      today,
      caller,
      model,
      estimatedInputTokens,
      `Estimated cost $${worstCaseCost.toFixed(4)} would exceed budget`
    )
    throw new BudgetExceededError(currentSpend, DAILY_BUDGET_USD)
  }

  // ── Make the actual API call ─────────────────────────────────────
  const client = getClient()
  let response: Anthropic.Message

  try {
    response = await client.messages.create(params as Parameters<typeof client.messages.create>[0])
  } catch (err) {
    // Log failed calls (these may still incur costs)
    const errMsg = err instanceof Error ? err.message : String(err)
    const isTokenError = errMsg.includes('prompt is too long')

    await prisma.$executeRawUnsafe(
      `INSERT INTO api_budget_log (date, caller, model, input_tokens, output_tokens, estimated_cost_usd, status, error_message)
       VALUES (?, ?, ?, ?, 0, ?, 'error', ?)`,
      today,
      caller,
      model,
      estimatedInputTokens,
      // Conservatively estimate cost for failed calls too
      isTokenError ? estimateCost(model, estimatedInputTokens, 0) : 0,
      errMsg.slice(0, 500)
    )
    throw err
  }

  // ── Record actual usage ──────────────────────────────────────────
  const inputTokens = response.usage?.input_tokens || 0
  const outputTokens = response.usage?.output_tokens || 0
  const actualCost = estimateCost(model, inputTokens, outputTokens)

  await prisma.$executeRawUnsafe(
    `INSERT INTO api_budget_log (date, caller, model, input_tokens, output_tokens, estimated_cost_usd, status)
     VALUES (?, ?, ?, ?, ?, ?, 'success')`,
    today,
    caller,
    model,
    inputTokens,
    outputTokens,
    actualCost
  )

  // ── Post-call budget warning ─────────────────────────────────────
  const newSpend = currentSpend + actualCost
  if (newSpend > DAILY_BUDGET_USD * 0.8) {
    console.warn(
      `[API Budget] WARNING: Daily spend at $${newSpend.toFixed(2)} / $${DAILY_BUDGET_USD.toFixed(2)} ` +
      `(${Math.round((newSpend / DAILY_BUDGET_USD) * 100)}%) after ${caller}`
    )
  }

  return response
}

// ── Utility: Truncate content to safe size ─────────────────────────────
/**
 * Truncate content to a safe size for API calls.
 * Preserves the beginning and end of content for context.
 */
export function truncateForAPI(content: string, maxChars: number = 150_000): string {
  if (content.length <= maxChars) return content

  const keepStart = Math.floor(maxChars * 0.8)
  const keepEnd = Math.floor(maxChars * 0.15)
  const truncatedNote = `\n\n[... ${(content.length - keepStart - keepEnd).toLocaleString()} characters truncated for API budget safety ...]\n\n`

  return content.slice(0, keepStart) + truncatedNote + content.slice(-keepEnd)
}
