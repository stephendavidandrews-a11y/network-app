'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Users,
  MessageSquare,
  Send,
  Calendar,
  Radio,
  Network,
  CheckSquare,
  Settings,
  LogOut,
} from 'lucide-react'
import { signOut } from 'next-auth/react'
import { cn } from '@/lib/utils'

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Contacts', href: '/contacts', icon: Users },
  { name: 'Interactions', href: '/interactions', icon: MessageSquare },
  { name: 'Outreach', href: '/outreach', icon: Send },
  { name: 'Events', href: '/events', icon: Calendar },
  { name: 'Signals', href: '/signals', icon: Radio },
  { name: 'Network', href: '/network', icon: Network },
  { name: 'Commitments', href: '/commitments', icon: CheckSquare },
  { name: 'Settings', href: '/settings', icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <div className="flex h-full w-60 flex-col bg-slate-900">
      <div className="flex h-14 items-center px-4 border-b border-slate-700/50">
        <Link href="/" className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-blue-600 flex items-center justify-center">
            <Network className="h-4 w-4 text-white" />
          </div>
          <span className="text-sm font-semibold text-slate-100">Network Intel</span>
        </Link>
      </div>

      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
        {navigation.map((item) => {
          const isActive =
            item.href === '/'
              ? pathname === '/'
              : pathname.startsWith(item.href)

          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-slate-700/60 text-slate-100'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              )}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {item.name}
            </Link>
          )
        })}
      </nav>

      <div className="border-t border-slate-700/50 p-2">
        <button
          onClick={() => signOut()}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors"
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </button>
      </div>
    </div>
  )
}
