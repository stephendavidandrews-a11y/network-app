'use client'

import { useState, useEffect } from 'react'
import { Save, Settings as SettingsIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

const TABS = [
  { id: 'style', label: 'Style Guide' },
  { id: 'expertise', label: 'Expertise Profile' },
  { id: 'tiers', label: 'Tier Config' },
  { id: 'venues', label: 'Venues' },
  { id: 'categories', label: 'Categories' },
  { id: 'email', label: 'Email' },
  { id: 'calendar', label: 'Google Calendar' },
]

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('style')
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch('/api/settings').then(r => r.json()).then(data => {
      const obj: Record<string, string> = {}
      for (const item of data) {
        obj[item.key] = item.value
      }
      setSettings(obj)
    })
  }, [])

  const saveSetting = async (key: string, value: string) => {
    setSaving(true)
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value }),
    })
    setSettings(prev => ({ ...prev, [key]: value }))
    setSaving(false)
  }

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <h1 className="text-2xl font-bold text-gray-900">Settings</h1>

      <div className="flex gap-6">
        {/* Tabs */}
        <div className="w-48 shrink-0">
          {TABS.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={cn(
                'block w-full text-left px-3 py-2 rounded-md text-sm font-medium transition-colors',
                activeTab === tab.id ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50'
              )}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1">
          {activeTab === 'style' && (
            <SettingEditor
              title="Style Guide"
              description="Used as system prompt context for Claude AI when drafting outreach messages. Describe your communication tone, structure preferences, things to never say, etc."
              settingKey="style_guide"
              value={settings.style_guide || ''}
              onSave={saveSetting}
              saving={saving}
            />
          )}

          {activeTab === 'expertise' && (
            <SettingEditor
              title="Expertise Profile"
              description="Your areas of expertise, short bio, and long bio. Used for CFP matching and abstract generation."
              settingKey="expertise_profile"
              value={settings.expertise_profile || ''}
              onSave={saveSetting}
              saving={saving}
            />
          )}

          {activeTab === 'tiers' && (
            <div className="rounded-lg border bg-white p-6 space-y-4">
              <h2 className="text-lg font-semibold text-gray-900">Tier Configuration</h2>
              <p className="text-sm text-gray-500">Contact cadence in days by tier level. Also set the daily outreach cap.</p>
              <div className="grid grid-cols-3 gap-4">
                {[1, 2, 3].map(tier => {
                  const config = tryParse(settings.tier_cadence, { '1': 30, '2': 60, '3': 90 })
                  return (
                    <div key={tier}>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Tier {tier} (days)</label>
                      <input type="number" value={config[String(tier)] || (tier === 1 ? 30 : tier === 2 ? 60 : 90)}
                        onChange={e => {
                          const newConfig = { ...config, [String(tier)]: parseInt(e.target.value) }
                          saveSetting('tier_cadence', JSON.stringify(newConfig))
                        }}
                        className="w-full rounded-md border px-3 py-2 text-sm" />
                    </div>
                  )
                })}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Daily Outreach Cap</label>
                <input type="number" value={settings.daily_outreach_cap || '5'}
                  onChange={e => saveSetting('daily_outreach_cap', e.target.value)}
                  className="w-32 rounded-md border px-3 py-2 text-sm" />
              </div>
            </div>
          )}

          {activeTab === 'venues' && (
            <SettingEditor
              title="Venues"
              description="Preferred meeting locations. JSON array of objects with name, address, neighborhood, formality, notes."
              settingKey="venues"
              value={settings.venues || '[]'}
              onSave={saveSetting}
              saving={saving}
            />
          )}

          {activeTab === 'categories' && (
            <SettingEditor
              title="Categories"
              description="Edit the category taxonomy. JSON array of category names."
              settingKey="categories"
              value={settings.categories || ''}
              onSave={saveSetting}
              saving={saving}
            />
          )}

          {activeTab === 'email' && (
            <div className="rounded-lg border bg-white p-6 space-y-4">
              <h2 className="text-lg font-semibold text-gray-900">Email Configuration</h2>
              <p className="text-sm text-gray-500">SMTP settings are configured via environment variables on the server.</p>
              <div className="space-y-2 text-sm text-gray-600">
                <p><strong>SMTP Host:</strong> Set via SMTP_HOST env var</p>
                <p><strong>SMTP Port:</strong> Set via SMTP_PORT env var</p>
                <p><strong>SMTP User:</strong> Set via SMTP_USER env var</p>
                <p><strong>From:</strong> Set via SMTP_FROM env var</p>
              </div>
            </div>
          )}

          {activeTab === 'calendar' && (
            <CalendarSettings />
          )}
        </div>
      </div>
    </div>
  )
}

function SettingEditor({
  title, description, settingKey, value, onSave, saving,
}: {
  title: string; description: string; settingKey: string
  value: string; onSave: (key: string, value: string) => Promise<void>; saving: boolean
}) {
  const [text, setText] = useState(value)

  useEffect(() => { setText(value) }, [value])

  return (
    <div className="rounded-lg border bg-white p-6 space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
        <p className="text-sm text-gray-500">{description}</p>
      </div>
      <textarea value={text} onChange={e => setText(e.target.value)}
        rows={12} className="w-full rounded-md border px-3 py-2 text-sm font-mono focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
      <button onClick={() => onSave(settingKey, text)} disabled={saving}
        className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
        <Save className="h-4 w-4" /> {saving ? 'Saving...' : 'Save'}
      </button>
    </div>
  )
}

function CalendarSettings() {
  const [status, setStatus] = useState<{ connected: boolean; email: string | null; error: string | null } | null>(null)
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<string | null>(null)

  const checkConnection = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/calendar/status')
      const data = await res.json()
      setStatus(data)
    } catch {
      setStatus({ connected: false, email: null, error: 'Failed to check connection' })
    }
    setLoading(false)
  }

  const triggerSync = async () => {
    setSyncing(true)
    setSyncResult(null)
    try {
      const res = await fetch('/api/jobs/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job: 'calendar_sync' }),
      })
      const data = await res.json()
      setSyncResult(`Synced ${data.result?.meetingCount || 0} meetings for ${data.result?.date || 'today'}`)
    } catch {
      setSyncResult('Sync failed')
    }
    setSyncing(false)
  }

  useEffect(() => { checkConnection() }, [])

  return (
    <div className="rounded-lg border bg-white p-6 space-y-4">
      <h2 className="text-lg font-semibold text-gray-900">Google Calendar</h2>
      <p className="text-sm text-gray-500">
        Calendar integration syncs your meetings daily at 5:00 AM UTC to enable meeting prep briefs and calendar-aware outreach volume.
      </p>

      {status && (
        <div className={cn('rounded-md p-3 text-sm', status.connected ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700')}>
          {status.connected
            ? `Connected to ${status.email}`
            : `Not connected: ${status.error || 'Credentials not configured'}`}
        </div>
      )}

      <div className="space-y-2 text-sm text-gray-600">
        <p><strong>Client ID:</strong> Set via GOOGLE_CLIENT_ID env var</p>
        <p><strong>Client Secret:</strong> Set via GOOGLE_CLIENT_SECRET env var</p>
        <p><strong>Refresh Token:</strong> Set via GOOGLE_REFRESH_TOKEN env var</p>
      </div>

      {syncResult && (
        <div className="rounded-md bg-blue-50 p-3 text-sm text-blue-700">{syncResult}</div>
      )}

      <div className="flex gap-2">
        <button onClick={checkConnection} disabled={loading}
          className="rounded-md border px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
          {loading ? 'Checking...' : 'Test Connection'}
        </button>
        <button onClick={triggerSync} disabled={syncing || !status?.connected}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
          {syncing ? 'Syncing...' : 'Sync Now'}
        </button>
      </div>
    </div>
  )
}

function tryParse(value: string | undefined, fallback: Record<string, number>) {
  if (!value) return fallback
  try { return JSON.parse(value) } catch { return fallback }
}
