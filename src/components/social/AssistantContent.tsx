'use client'

import Link from 'next/link'
import { useState, useRef, useEffect, useCallback } from 'react'
import { Send, Loader2, User, Bot, Wrench } from 'lucide-react'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  toolCalls?: Array<{
    tool: string
    input?: Record<string, unknown>
    result?: unknown
  }>
}

const QUICK_ACTIONS = [
  { label: "Who's overdue?", prompt: "Who's overdue for a text?" },
  { label: 'Plan a happy hour', prompt: 'Plan a happy hour for this weekend' },
  { label: 'Draft reach-outs', prompt: 'Draft reach-out texts for my most overdue contacts' },
  { label: 'Upcoming birthdays', prompt: 'Any upcoming birthdays in the next 2 weeks?' },
  { label: 'Social stats', prompt: "Give me a quick overview of my social stats" },
]

const RING_COLORS: Record<string, string> = {
  close: 'text-purple-600',
  regular: 'text-blue-600',
  outer: 'text-gray-600',
  new: 'text-green-600',
}

export function AssistantContent() {
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    if (typeof window !== 'undefined') {
      const saved = sessionStorage.getItem('assistant-messages')
      if (saved) {
        try { return JSON.parse(saved) } catch { /* ignore */ }
      }
    }
    return []
  })
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [activeTools, setActiveTools] = useState<string[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Save messages to sessionStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('assistant-messages', JSON.stringify(messages))
    }
  }, [messages])

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, activeTools])

  const handleSend = useCallback(async (text?: string) => {
    const messageText = text || input.trim()
    if (!messageText || loading) return

    setInput('')
    const userMessage: ChatMessage = { role: 'user', content: messageText }
    const newMessages = [...messages, userMessage]
    setMessages(newMessages)
    setLoading(true)
    setActiveTools([])

    try {
      // Build conversation for API
      const apiMessages = newMessages.map(m => ({
        role: m.role,
        content: m.content,
      }))

      const response = await fetch('/api/social/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: apiMessages }),
      })

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`)
      }

      const reader = response.body?.getReader()
      if (!reader) throw new Error('No response body')

      const decoder = new TextDecoder()
      let assistantText = ''
      const toolCalls: ChatMessage['toolCalls'] = []
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        // Process complete SSE events
        const lines = buffer.split('\n')
        buffer = lines.pop() || '' // Keep incomplete line in buffer

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const jsonStr = line.slice(6)

          try {
            const event = JSON.parse(jsonStr)

            switch (event.type) {
              case 'text':
                assistantText += event.content
                // Update message in real-time
                setMessages(prev => {
                  const updated = [...prev]
                  const lastIdx = updated.length - 1
                  if (lastIdx >= 0 && updated[lastIdx].role === 'assistant') {
                    updated[lastIdx] = { ...updated[lastIdx], content: assistantText }
                  } else {
                    updated.push({ role: 'assistant', content: assistantText, toolCalls: [...toolCalls] })
                  }
                  return updated
                })
                break

              case 'tool_call':
                setActiveTools(prev => [...prev, event.tool])
                toolCalls.push({ tool: event.tool, input: event.input })
                break

              case 'tool_result':
                setActiveTools(prev => prev.filter(t => t !== event.tool))
                // Update the last tool call with its result
                const lastToolIdx = toolCalls.length - 1
                if (lastToolIdx >= 0 && toolCalls[lastToolIdx].tool === event.tool) {
                  toolCalls[lastToolIdx].result = event.result
                }
                break

              case 'error':
                assistantText += `\n\n⚠️ Error: ${event.message}`
                break

              case 'done':
                break
            }
          } catch {
            // Skip malformed JSON
          }
        }
      }

      // Final message update with tool calls
      setMessages(prev => {
        const updated = [...prev]
        const lastIdx = updated.length - 1
        if (lastIdx >= 0 && updated[lastIdx].role === 'assistant') {
          updated[lastIdx] = {
            role: 'assistant',
            content: assistantText,
            toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
          }
        } else {
          updated.push({
            role: 'assistant',
            content: assistantText || '(No response)',
            toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
          })
        }
        return updated
      })
    } catch (err) {
      console.error('Assistant error:', err)
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: `⚠️ Error: ${String(err)}` },
      ])
    }

    setLoading(false)
    setActiveTools([])
    inputRef.current?.focus()
  }, [input, loading, messages])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const clearChat = () => {
    setMessages([])
    sessionStorage.removeItem('assistant-messages')
  }

  return (
    <div className="flex flex-col h-[calc(100vh-120px)]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-white">
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-indigo-600" />
          <h1 className="text-lg font-semibold text-gray-900">Social Assistant</h1>
        </div>
        <div className="flex gap-2">
          <button
            onClick={clearChat}
            className="rounded-md border border-gray-200 px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-50"
          >
            Clear Chat
          </button>
          <Link href="/social" className="rounded-md bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-200">
            Dashboard
          </Link>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 bg-gray-50">
        {messages.length === 0 && (
          <div className="text-center py-12">
            <Bot className="h-12 w-12 text-indigo-300 mx-auto mb-4" />
            <h2 className="text-lg font-medium text-gray-700 mb-2">Hey! What can I help with?</h2>
            <p className="text-sm text-gray-500 mb-6">I can search your contacts, plan events, draft texts, and more.</p>
            <div className="flex flex-wrap gap-2 justify-center">
              {QUICK_ACTIONS.map(action => (
                <button
                  key={action.label}
                  onClick={() => handleSend(action.prompt)}
                  className="rounded-full border border-indigo-200 bg-white px-4 py-2 text-sm text-indigo-700 hover:bg-indigo-50 hover:border-indigo-300 transition-colors"
                >
                  {action.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, idx) => (
          <div key={idx} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'assistant' && (
              <div className="flex-shrink-0 mt-1">
                <div className="h-7 w-7 rounded-full bg-indigo-100 flex items-center justify-center">
                  <Bot className="h-4 w-4 text-indigo-600" />
                </div>
              </div>
            )}
            <div className={`max-w-[80%] ${msg.role === 'user' ? 'order-1' : ''}`}>
              {/* Tool calls indicator */}
              {msg.toolCalls && msg.toolCalls.length > 0 && (
                <div className="mb-2 space-y-1">
                  {msg.toolCalls.map((tc, i) => (
                    <ToolCallCard key={i} toolCall={tc} />
                  ))}
                </div>
              )}
              <div
                className={`rounded-2xl px-4 py-2.5 text-sm ${
                  msg.role === 'user'
                    ? 'bg-blue-600 text-white rounded-br-md'
                    : 'bg-white text-gray-800 shadow-sm rounded-bl-md border border-gray-100'
                }`}
              >
                <div className="whitespace-pre-wrap">{msg.content}</div>
              </div>
            </div>
            {msg.role === 'user' && (
              <div className="flex-shrink-0 mt-1 order-2">
                <div className="h-7 w-7 rounded-full bg-blue-100 flex items-center justify-center">
                  <User className="h-4 w-4 text-blue-600" />
                </div>
              </div>
            )}
          </div>
        ))}

        {/* Active tool calls */}
        {activeTools.length > 0 && (
          <div className="flex gap-3">
            <div className="flex-shrink-0 mt-1">
              <div className="h-7 w-7 rounded-full bg-indigo-100 flex items-center justify-center">
                <Bot className="h-4 w-4 text-indigo-600" />
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-lg bg-white border border-gray-100 px-3 py-2 shadow-sm">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-500" />
              <span className="text-xs text-gray-500">
                Using: {activeTools.map(t => formatToolName(t)).join(', ')}
              </span>
            </div>
          </div>
        )}

        {loading && activeTools.length === 0 && (
          <div className="flex gap-3">
            <div className="flex-shrink-0 mt-1">
              <div className="h-7 w-7 rounded-full bg-indigo-100 flex items-center justify-center">
                <Bot className="h-4 w-4 text-indigo-600" />
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-lg bg-white border border-gray-100 px-3 py-2 shadow-sm">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />
              <span className="text-xs text-gray-400">Thinking...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Quick actions when chat has messages */}
      {messages.length > 0 && !loading && (
        <div className="flex gap-1.5 px-4 pt-2 overflow-x-auto">
          {QUICK_ACTIONS.slice(0, 3).map(action => (
            <button
              key={action.label}
              onClick={() => handleSend(action.prompt)}
              className="whitespace-nowrap rounded-full border border-gray-200 bg-white px-3 py-1 text-xs text-gray-600 hover:bg-gray-50"
            >
              {action.label}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="border-t border-gray-200 bg-white px-4 py-3">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask me anything about your contacts..."
            rows={1}
            className="flex-1 resize-none rounded-xl border border-gray-300 px-4 py-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            style={{ maxHeight: '120px' }}
          />
          <button
            onClick={() => handleSend()}
            disabled={!input.trim() || loading}
            className="flex-shrink-0 rounded-xl bg-indigo-600 p-2.5 text-white hover:bg-indigo-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────

function ToolCallCard({ toolCall }: { toolCall: { tool: string; input?: Record<string, unknown>; result?: unknown } }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50 text-xs">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 w-full px-2.5 py-1.5 text-left hover:bg-gray-100 rounded-lg"
      >
        <Wrench className="h-3 w-3 text-gray-400" />
        <span className="text-gray-500">{formatToolName(toolCall.tool)}</span>
        {toolCall.result && <span className="text-green-500 ml-auto">✓</span>}
        <span className="text-gray-300 ml-1">{expanded ? '▼' : '▶'}</span>
      </button>
      {expanded && toolCall.result && (
        <div className="px-2.5 pb-2 max-h-60 overflow-y-auto">
          <ToolResultDisplay tool={toolCall.tool} result={toolCall.result} />
        </div>
      )}
    </div>
  )
}

function ToolResultDisplay({ tool, result }: { tool: string; result: unknown }) {
  if (!result) return null

  // Contact list display
  if (Array.isArray(result) && result.length > 0 && result[0]?.name) {
    return (
      <div className="space-y-1 mt-1">
        {(result as Array<Record<string, unknown>>).map((item, i) => (
          <div key={i} className="flex items-center justify-between bg-white rounded px-2 py-1 border border-gray-100">
            <div className="flex items-center gap-1.5">
              <span className="font-medium text-gray-800">{String(item.name)}</span>
              {item.ring && (
                <span className={`text-[10px] font-medium ${RING_COLORS[String(item.ring)] || 'text-gray-500'}`}>
                  {String(item.ring)}
                </span>
              )}
            </div>
            <div className="text-gray-400">
              {item.daysSinceContact !== undefined && (
                <span>{String(item.daysSinceContact)}d ago</span>
              )}
              {item.city && <span className="ml-2">{String(item.city)}</span>}
            </div>
          </div>
        ))}
      </div>
    )
  }

  // Plan display
  if (typeof result === 'object' && result !== null && 'planId' in (result as Record<string, unknown>)) {
    const plan = result as Record<string, unknown>
    return (
      <div className="mt-1 bg-white rounded p-2 border border-gray-100">
        <div className="font-medium text-gray-800 mb-1">
          Plan: {String(plan.planType)} on {String(plan.targetDate)}
        </div>
        {plan.venue && typeof plan.venue === 'object' && (
          <div className="text-gray-500">Venue: {String((plan.venue as Record<string, unknown>).name)}</div>
        )}
      </div>
    )
  }

  // Generic JSON display
  return (
    <pre className="text-[10px] text-gray-500 whitespace-pre-wrap break-all mt-1 bg-white rounded p-2 border border-gray-100">
      {JSON.stringify(result, null, 2).slice(0, 500)}
    </pre>
  )
}

function formatToolName(tool: string): string {
  const names: Record<string, string> = {
    search_contacts: 'Searching contacts',
    get_contact_details: 'Getting contact details',
    get_overdue_contacts: 'Finding overdue contacts',
    search_life_events: 'Searching life events',
    generate_plan: 'Generating plan',
    draft_message: 'Drafting message',
    send_message: 'Sending message',
    get_social_stats: 'Getting stats',
    search_venues: 'Searching venues',
    get_groups: 'Loading groups',
    get_nudges: 'Getting today\'s nudges',
    complete_nudge: 'Completing nudge',
    dismiss_nudge: 'Dismissing nudge',
  }
  return names[tool] || tool
}
