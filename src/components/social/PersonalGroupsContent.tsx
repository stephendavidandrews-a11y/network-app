'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface GroupMember {
  id: string
  name: string
  photoUrl: string | null
  ring: string | null
  city: string | null
  lastInteraction: string | null
}

interface GroupData {
  id: string
  name: string
  description: string | null
  members: GroupMember[]
}

export function PersonalGroupsContent({ groups }: { groups: GroupData[] }) {
  const router = useRouter()
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)

  async function createGroup() {
    if (!newName.trim()) return
    setCreating(true)
    try {
      await fetch('/api/social/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim() }),
      })
      setNewName('')
      router.refresh()
    } catch (err) {
      alert('Error: ' + err)
    }
    setCreating(false)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Groups</h1>
      </div>

      {/* Create group */}
      <div className="flex gap-2">
        <input
          value={newName}
          onChange={e => setNewName(e.target.value)}
          placeholder="New group name..."
          className="rounded-md border border-gray-300 px-3 py-2 text-sm flex-1"
          onKeyDown={e => e.key === 'Enter' && createGroup()}
        />
        <button
          onClick={createGroup}
          disabled={creating || !newName.trim()}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          Create
        </button>
      </div>

      {/* Groups list */}
      <div className="space-y-4">
        {groups.map(g => (
          <div key={g.id} className="rounded-lg bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="font-semibold text-gray-900">{g.name}</h3>
                {g.description && <p className="text-xs text-gray-500">{g.description}</p>}
              </div>
              <span className="text-sm text-gray-500">{g.members.length} members</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {g.members.map(m => (
                <Link key={m.id} href={`/contacts/${m.id}`} className="flex items-center gap-2 p-2 rounded hover:bg-gray-50">
                  <div className="h-8 w-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-medium text-gray-600">
                    {m.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                  </div>
                  <div>
                    <div className="text-sm font-medium text-gray-900">{m.name}</div>
                    {m.city && <div className="text-[10px] text-gray-500">{m.city}</div>}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>

      {groups.length === 0 && (
        <p className="text-center py-12 text-gray-500">No groups yet. Create one above!</p>
      )}
    </div>
  )
}
