import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function parseJsonField<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

export function daysSince(dateStr: string | null): number | null {
  if (!dateStr) return null
  const date = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  return Math.floor(diff / (1000 * 60 * 60 * 24))
}

export function isOverdue(lastInteraction: string | null, cadenceDays: number): boolean {
  if (!lastInteraction) return true
  const days = daysSince(lastInteraction)
  return days !== null && days > cadenceDays
}

export function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function formatRelativeDate(dateStr: string | null): string {
  if (!dateStr) return 'Never'
  const days = daysSince(dateStr)
  if (days === null) return 'Never'
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  if (days < 365) return `${Math.floor(days / 30)}mo ago`
  return `${Math.floor(days / 365)}y ago`
}

export function toISODate(date: Date = new Date()): string {
  return date.toISOString().split('T')[0]
}
